import { describe, it, expect } from "vitest";
import { normalizeTitle, buildPrompt, DEFAULT_TITLE } from "../src/title.js";

describe("normalizeTitle", () => {
  it("passes through short ASCII titles unchanged", () => {
    expect(normalizeTitle("Hello world")).toBe("Hello world");
  });

  it("strips newlines and replaces with space", () => {
    expect(normalizeTitle("line1\nline2")).toBe("line1 line2");
  });

  it("strips carriage returns", () => {
    expect(normalizeTitle("line1\r\nline2")).toBe("line1 line2");
  });

  it("removes surrounding double quotes", () => {
    expect(normalizeTitle('"Title here"')).toBe("Title here");
  });

  it("removes surrounding single quotes", () => {
    expect(normalizeTitle("'Title here'")).toBe("Title here");
  });

  it("truncates to 50 codepoints", () => {
    const long = "A".repeat(80);
    const result = normalizeTitle(long);
    expect(result.length).toBe(50);
    expect(result).toBe("A".repeat(50));
  });

  it("truncates multibyte characters on codepoint boundary", () => {
    // Each emoji is 2 codepoints (flag sequence) or 1 codepoint
    const emojis = "😀".repeat(60);
    const result = normalizeTitle(emojis);
    // Each 😀 is 1 codepoint; should have 50
    expect([...result].length).toBe(50);
  });

  it("trims whitespace", () => {
    expect(normalizeTitle("  title  ")).toBe("title");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("buildPrompt", () => {
  it("returns a single user message", () => {
    const messages = buildPrompt("Hello");
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("includes the message text in the prompt", () => {
    const messages = buildPrompt("Write a function");
    const text = messages[0].content[0].text;
    expect(text).toContain("Write a function");
  });

  it("requests less than 50 characters in the prompt", () => {
    const messages = buildPrompt("test");
    const text = messages[0].content[0].text;
    expect(text).toContain("less than 50 characters");
  });

  it("truncates long messages to ~2000 chars", () => {
    const long = "A".repeat(5000);
    const messages = buildPrompt(long);
    const text = messages[0].content[0].text;
    // The message content should be truncated
    expect(text).not.toContain("A".repeat(2001));
  });
});
