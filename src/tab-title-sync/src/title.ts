/**
 * Pure helpers for building the summarization prompt and normalizing titles.
 */

export const DEFAULT_TITLE = "Pi";

const MAX_TITLE_LENGTH = 50;

/**
 * Strip newlines, surrounding quotes, and truncate to ≤ MAX_TITLE_LENGTH
 * codepoints (multibyte-safe via [...string] spread).
 */
export function normalizeTitle(raw: string): string {
  let s = raw
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .trim();

  // Remove surrounding quotes
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }

  // Truncate on codepoint boundary
  const codepoints = [...s];
  if (codepoints.length > MAX_TITLE_LENGTH) {
    return codepoints.slice(0, MAX_TITLE_LENGTH).join("");
  }
  return s;
}

/**
 * Build the prompt messages for title summarization.
 * Requests output of less than 50 characters.
 */
export function buildPrompt(message: string): Array<{
  role: "user";
  content: Array<{ type: "text"; text: string }>;
}> {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "You are a concise title generator. Given the user's first message, produce a very short title (less than 50 characters) that summarizes the topic.",
            "Output ONLY the title text, nothing else. No quotes, no prefixes, no explanation.",
            "",
            "User's message:",
            message.slice(0, 2000),
          ].join("\n"),
        },
      ],
    },
  ];
}
