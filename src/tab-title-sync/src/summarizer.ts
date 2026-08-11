/**
 * Summarizer with an injectable model call.
 *
 * The model call abstraction keeps this module decoupled from pi's runtime;
 * the entry point (index.ts) wires the real model call using the
 * registered pi-orca-zen provider.
 */

import { buildPrompt, normalizeTitle } from "./title.js";

/**
 * A function that sends prompt messages to a model and returns the raw
 * extracted text from the response.
 */
export type SummarizeModelCall = (
  messages: Array<{
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  }>,
) => Promise<string>;

/**
 * Summarize a user message into a ≤50-character title.
 *
 * On success the model output is normalized (stripped, truncated).
 * On failure the fallback is the message's first line truncated to 50
 * codepoints.
 */
export async function summarize(
  message: string,
  modelCall: SummarizeModelCall,
): Promise<string> {
  const messages = buildPrompt(message);

  try {
    const raw = await modelCall(messages);
    return normalizeTitle(raw);
  } catch {
    // Fallback: first line truncated to 50 codepoints
    const firstLine = message.split("\n")[0] ?? message;
    return [...firstLine].slice(0, 50).join("");
  }
}
