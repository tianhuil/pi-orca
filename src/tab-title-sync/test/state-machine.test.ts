/**
 * Tests the first-message state machine and title-resolution logic.
 *
 * We test the observable behavior — whether a rename was issued, whether a
 * store row was written, what the resulting title is — using an injected
 * store and fake ctx/pi. No real pi, no real Orca, no real model.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Executor } from "../src/orca.js";
import type { TitleStore } from "../src/store.js";
import { DEFAULT_TITLE } from "../src/title.js";

// ---------------------------------------------------------------------------
// Lightweight fakes
// ---------------------------------------------------------------------------

function createFakeStore(): TitleStore & { _rows: Map<string, { firstMessage: string; title: string | null }> } {
  const rows = new Map();
  return {
    _rows: rows,
    get(sessionId: string) {
      const r = rows.get(sessionId);
      return r
        ? { sessionId, firstMessage: r.firstMessage, title: r.title, createdAt: Date.now(), updatedAt: null }
        : undefined;
    },
    insertFirstMessage(sessionId: string, firstMessage: string) {
      rows.set(sessionId, { firstMessage, title: null });
    },
    updateTitle(sessionId: string, title: string) {
      const r = rows.get(sessionId);
      if (r) r.title = title;
    },
  };
}

type RenameCall = { handle: string; title: string };

function createFakeOrca(): { executor: Executor; renames: RenameCall[]; creates: string[] } {
  const renames: RenameCall[] = [];
  const creates: string[] = [];
  const executor: Executor = vi.fn(async (cmd, args) => {
    if (cmd === "orca" && args[0] === "terminal" && args[1] === "rename") {
      // Parse: --terminal <handle> --title <title>
      const handleIdx = args.indexOf("--terminal");
      const titleIdx = args.indexOf("--title");
      renames.push({ handle: args[handleIdx + 1]!, title: args[titleIdx + 1]! });
      return { stdout: "{}", code: 0 };
    }
    if (cmd === "orca" && args[0] === "terminal" && args[1] === "create") {
      const titleIdx = args.indexOf("--title");
      creates.push(args[titleIdx + 1]!);
      return { stdout: "{}", code: 0 };
    }
    return { stdout: "", code: 1 };
  });
  return { executor, renames, creates };
}

function createFakeCtx(overrides: Record<string, unknown> = {}) {
  return {
    sessionManager: {
      getSessionId: () => overrides.sessionId ?? "test-session-id",
      getEntries: () => overrides.entries ?? [],
    },
    modelRegistry: {
      find: () => overrides.model ?? { id: "mimo-v2.5-free", provider: "pi-orca-zen" },
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "public", headers: {}, env: {} }),
    },
    ui: {
      notify: vi.fn(),
    },
    cwd: "/tmp",
  };
}

function createFakePi() {
  const names: string[] = [];
  return {
    names,
    setSessionName(name: string) {
      names.push(name);
    },
  };
}

// ---------------------------------------------------------------------------
// State machine: a mini replica of the session_start + input logic
// ---------------------------------------------------------------------------

/**
 * Replicates the state machine from index.ts so we can test it without
 * loading the real extension. The logic is:
 *
 *  session_start:
 *    row with title     → setSessionName + rename(title); canPersist = false
 *    row with firstMsg  → re-summarize + setSessionName + rename(title); canPersist = false
 *    no row + entries=0 → rename("Pi"); canPersist = true
 *    no row + entries>0 → rename("Pi"); canPersist = false
 *
 *  input:
 *    source=extension or starts with "/" → skip
 *    !canPersist → skip
 *    row exists → skip
 *    → insertFirstMessage; canPersist = false; summarize + updateTitle + apply
 */
interface MachineState {
  canPersist: boolean;
}

async function runSessionStart(
  state: MachineState,
  store: TitleStore,
  fakePi: ReturnType<typeof createFakePi>,
  fakeOrca: ReturnType<typeof createFakeOrca>,
  fakeCtx: ReturnType<typeof createFakeCtx>,
  summarizeResult: string | null,
): Promise<void> {
  const sessionId = fakeCtx.sessionManager.getSessionId();
  const row = store.get(sessionId);

  if (row?.title) {
    fakePi.setSessionName(row.title);
    const handle = "fake-handle";
    fakeOrca.executor("orca", ["terminal", "rename", "--terminal", handle, "--title", row.title, "--json"]);
    state.canPersist = false;
    return;
  }

  if (row?.firstMessage && !row.title) {
    const title = summarizeResult ?? "fallback";
    store.updateTitle(sessionId, title);
    fakePi.setSessionName(title);
    const handle = "fake-handle";
    fakeOrca.executor("orca", ["terminal", "rename", "--terminal", handle, "--title", title, "--json"]);
    state.canPersist = false;
    return;
  }

  // No row
  state.canPersist = fakeCtx.sessionManager.getEntries().length === 0;
  const handle = "fake-handle";
  fakeOrca.executor("orca", ["terminal", "rename", "--terminal", handle, "--title", DEFAULT_TITLE, "--json"]);
}

async function runInput(
  state: MachineState,
  store: TitleStore,
  fakePi: ReturnType<typeof createFakePi>,
  fakeOrca: ReturnType<typeof createFakeOrca>,
  fakeCtx: ReturnType<typeof createFakeCtx>,
  event: { text: string; source: string },
  summarizeResult: string,
): Promise<void> {
  if (event.source === "extension") return;
  if (event.text.startsWith("/")) return;

  const sessionId = fakeCtx.sessionManager.getSessionId();
  if (!state.canPersist) return;
  if (store.get(sessionId)) return;

  state.canPersist = false;
  store.insertFirstMessage(sessionId, event.text);

  const title = summarizeResult;
  store.updateTitle(sessionId, title);
  fakePi.setSessionName(title);
  const handle = "fake-handle";
  fakeOrca.executor("orca", ["terminal", "rename", "--terminal", handle, "--title", title, "--json"]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("first-message state machine", () => {
  let store: ReturnType<typeof createFakeStore>;
  let fakePi: ReturnType<typeof createFakePi>;
  let fakeOrca: ReturnType<typeof createFakeOrca>;
  let state: MachineState;

  beforeEach(() => {
    store = createFakeStore();
    fakePi = createFakePi();
    fakeOrca = createFakeOrca();
    state = { canPersist: false };
  });

  it("fresh session: first input persists and summarizes", async () => {
    const fakeCtx = createFakeCtx({ entries: [] });
    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    expect(state.canPersist).toBe(true);
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe(DEFAULT_TITLE);

    // First input
    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "Refactor auth module", source: "interactive" },
      "Refactor auth",
    );

    expect(store.get("test-session-id")!.firstMessage).toBe("Refactor auth module");
    expect(store.get("test-session-id")!.title).toBe("Refactor auth");
    expect(fakePi.names).toContain("Refactor auth");
  });

  it("second input is skipped (already persisted)", async () => {
    const fakeCtx = createFakeCtx({ entries: [] });
    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "First message", source: "interactive" },
      "First",
    );

    // Second input
    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "Second message", source: "interactive" },
      "Second",
    );

    expect(store.get("test-session-id")!.firstMessage).toBe("First message");
    expect(store.get("test-session-id")!.title).toBe("First");
    // Only 2 renames: session_start ("Pi") + first input ("First")
    expect(fakeOrca.renames).toHaveLength(2);
  });

  it("extension-source input is skipped", async () => {
    const fakeCtx = createFakeCtx({ entries: [] });
    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "Steer message", source: "extension" },
      "Steer",
    );

    expect(store.get("test-session-id")).toBeUndefined();
    expect(state.canPersist).toBe(true);
  });

  it("slash-prefixed input is skipped", async () => {
    const fakeCtx = createFakeCtx({ entries: [] });
    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "/model anthropic/claude-sonnet-4", source: "interactive" },
      "Model",
    );

    expect(store.get("test-session-id")).toBeUndefined();
    expect(state.canPersist).toBe(true);
  });

  it("existing row backstops persistence", async () => {
    const fakeCtx = createFakeCtx({ entries: [] });
    store.insertFirstMessage("test-session-id", "pre-existing");
    store.updateTitle("test-session-id", "Pre-existing");

    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    // canPersist should be false because a row exists
    expect(state.canPersist).toBe(false);

    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "New message", source: "interactive" },
      "New",
    );

    expect(store.get("test-session-id")!.firstMessage).toBe("pre-existing");
  });

  it("old session with history but no row: never persists", async () => {
    const fakeCtx = createFakeCtx({ entries: [{ type: "message" }] });
    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    expect(state.canPersist).toBe(false);
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe(DEFAULT_TITLE);

    await runInput(
      state, store, fakePi, fakeOrca, fakeCtx,
      { text: "Some message", source: "interactive" },
      "Some",
    );

    // Should not have been persisted
    expect(store.get("test-session-id")).toBeUndefined();
  });
});

describe("resume logic", () => {
  let store: ReturnType<typeof createFakeStore>;
  let fakePi: ReturnType<typeof createFakePi>;
  let fakeOrca: ReturnType<typeof createFakeOrca>;
  let state: MachineState;

  beforeEach(() => {
    store = createFakeStore();
    fakePi = createFakePi();
    fakeOrca = createFakeOrca();
    state = { canPersist: false };
  });

  it("row with title → restore without model call", async () => {
    store.insertFirstMessage("sess-1", "msg");
    store.updateTitle("sess-1", "Stored Title");
    const fakeCtx = createFakeCtx({ sessionId: "sess-1", entries: [] });

    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    expect(fakePi.names).toContain("Stored Title");
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe("Stored Title");
  });

  it("row with firstMessage but no title → re-summarize", async () => {
    store.insertFirstMessage("sess-2", "crash before title");
    const fakeCtx = createFakeCtx({ sessionId: "sess-2", entries: [] });

    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, "Recovered Title");

    expect(store.get("sess-2")!.title).toBe("Recovered Title");
    expect(fakePi.names).toContain("Recovered Title");
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe("Recovered Title");
  });

  it("no row + history → no persist, shows Pi", async () => {
    const fakeCtx = createFakeCtx({ sessionId: "sess-3", entries: [{ type: "message" }] });

    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    expect(state.canPersist).toBe(false);
    expect(fakePi.names).toHaveLength(0); // no setSessionName
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe(DEFAULT_TITLE);
  });

  it("no row + fresh → shows Pi, allows persist", async () => {
    const fakeCtx = createFakeCtx({ sessionId: "sess-4", entries: [] });

    await runSessionStart(state, store, fakePi, fakeOrca, fakeCtx, null);

    expect(state.canPersist).toBe(true);
    expect(fakePi.names).toHaveLength(0);
    expect(fakeOrca.renames).toHaveLength(1);
    expect(fakeOrca.renames[0]!.title).toBe(DEFAULT_TITLE);
  });
});
