/**
 * Tab-title-sync extension — keeps the Orca tab title in sync with the
 * pi session running inside it.
 *
 * - Registers a self-contained free zen provider for summarization.
 * - On session start, restores stored titles or renames to "Pi".
 * - On first user message, persists it and asynchronously summarizes a title.
 * - Adds `/spawn` to open a new Orca tab running pi.
 */

import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Executor } from "./orca.js";
import {
  createTerminal,
  getTerminalHandle,
  renameTerminal,
} from "./orca.js";
import { createTitleStore, resolveDbPath } from "./store.js";
import { summarize, type SummarizeModelCall } from "./summarizer.js";
import { DEFAULT_TITLE } from "./title.js";

// ---------------------------------------------------------------------------
// Provider registration (happens in the factory, before handlers fire)
// ---------------------------------------------------------------------------

const PROVIDER_ID = "pi-orca-zen";
const MODEL_ID = "mimo-v2.5-free";
const SUMMARIZE_MAX_TOKENS = 80;

function registerZenProvider(pi: ExtensionAPI): void {
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: "https://opencode.ai/zen/v1",
    api: "openai-completions",
    apiKey: "public",
    models: [
      {
        id: MODEL_ID,
        name: "Mimo v2.5 Free",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 32000,
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          maxTokensField: "max_tokens",
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Real executor — runs shell commands via pi.exec
// ---------------------------------------------------------------------------

function createPiExecutor(pi: ExtensionAPI): Executor {
  return async (command: string, args: string[]): Promise<{ stdout: string; code: number }> => {
    const result = await pi.exec(command, args, { timeout: 10_000 });
    return { stdout: result.stdout ?? "", code: result.code ?? 0 };
  };
}

// ---------------------------------------------------------------------------
// Wiring: create the model-call closure from ctx
// ---------------------------------------------------------------------------

function createModelCall(
  ctx: ExtensionContext,
): SummarizeModelCall {
  return async (messages) => {
    const model = ctx.modelRegistry.find(PROVIDER_ID, MODEL_ID);
    if (!model) {
      throw new Error(`Model ${PROVIDER_ID}/${MODEL_ID} not found in registry`);
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) {
      throw new Error(`No auth for ${PROVIDER_ID}/${MODEL_ID}`);
    }

    const response = await complete(
      model,
      { messages },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        maxTokens: SUMMARIZE_MAX_TOKENS,
        sessionId: ctx.sessionManager.getSessionId(),
      },
    );

    return response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
  };
}

// ---------------------------------------------------------------------------
// Apply title: setSessionName + orca rename (rename last per ADR-0001)
// ---------------------------------------------------------------------------

async function applyTitle(
  pi: ExtensionAPI,
  executor: Executor,
  title: string,
): Promise<void> {
  // Set pi's internal display name (session picker)
  pi.setSessionName(title);

  // Orca tab rename (sticky — applied last, per ADR-0001)
  const handle = getTerminalHandle();
  if (handle) {
    await renameTerminal(executor, handle, title).catch(() => {
      // Silently ignore rename failures (e.g. Orca not running)
    });
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  // Register the provider before any handler can fire.
  registerZenProvider(pi);

  // Initialize store (persistent DB)
  const store = createTitleStore(resolveDbPath());

  // Executor for Orca CLI commands
  const executor = createPiExecutor(pi);

  // Per-session mutable state (reset on each session_start).
  // `canPersist` is true only for truly fresh sessions (no entries, no store row).
  let canPersist = false;

  // -----------------------------------------------------------------------
  // session_start
  // -----------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const row = store.get(sessionId);
    const handle = getTerminalHandle();

    if (row?.title) {
      // Row with a title → restore
      pi.setSessionName(row.title);
      if (handle) {
        await renameTerminal(executor, handle, row.title).catch(() => {});
      }
      canPersist = false;
      return;
    }

    if (row?.firstMessage && !row.title) {
      // Row with only a first message → re-summarize (crash recovery)
      const modelCall = createModelCall(ctx);
      const title = await summarize(row.firstMessage, modelCall);
      store.updateTitle(sessionId, title);
      pi.setSessionName(title);
      if (handle) {
        await renameTerminal(executor, handle, title).catch(() => {});
      }
      canPersist = false;
      return;
    }

    // No row at all
    canPersist = ctx.sessionManager.getEntries().length === 0;

    // Rename tab to default title ("Pi")
    if (handle) {
      await renameTerminal(executor, handle, DEFAULT_TITLE).catch(() => {});
    }
    // Do NOT call pi.setSessionName() — pi's picker keeps showing the
    // first message once it arrives.
  });

  // -----------------------------------------------------------------------
  // input
  // -----------------------------------------------------------------------
  pi.on("input", async (event, ctx) => {
    // Skip extension-sourced and command inputs
    if (event.source === "extension") return;
    if (event.text.startsWith("/")) return;

    const sessionId = ctx.sessionManager.getSessionId();

    // Only persist on the first message of a persist-eligible session
    if (!canPersist) return;
    if (store.get(sessionId)) return;

    // Persist the first message (idempotent — second call short-circuited above)
    canPersist = false; // prevent any re-entry
    store.insertFirstMessage(sessionId, event.text);

    // Summarize asynchronously and apply the title
    const modelCall = createModelCall(ctx);
    const title = await summarize(event.text, modelCall);
    store.updateTitle(sessionId, title);
    await applyTitle(pi, executor, title);
  });

  // -----------------------------------------------------------------------
  // /spawn command
  // -----------------------------------------------------------------------
  pi.registerCommand("spawn", {
    description:
      "Open a new Orca tab running pi in the current worktree with a fresh session",
    handler: async (_args, ctx) => {
      const handle = getTerminalHandle();
      if (!handle) {
        ctx.ui.notify(
          "/spawn requires Orca — ORCA_TERMINAL_HANDLE is not set",
          "error",
        );
        return;
      }

      try {
        await createTerminal(executor, DEFAULT_TITLE);
      } catch (err) {
        ctx.ui.notify(
          `/spawn failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    },
  });
}
