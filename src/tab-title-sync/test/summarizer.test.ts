import { describe, it, expect, vi } from "vitest";
import { summarize, type SummarizeModelCall } from "../src/summarizer.js";

describe("summarizer", () => {
  it("returns the normalized model output on success", async () => {
    const modelCall: SummarizeModelCall = vi.fn(async () => "Refactor auth module");
    const title = await summarize("Refactor the authentication module", modelCall);
    expect(title).toBe("Refactor auth module");
    expect(modelCall).toHaveBeenCalledOnce();
  });

  it("strips newlines from model output", async () => {
    const modelCall: SummarizeModelCall = vi.fn(async () => "Title\nwith\nnewlines");
    const title = await summarize("test", modelCall);
    expect(title).toBe("Title with newlines");
  });

  it("truncates model output to 50 codepoints", async () => {
    const modelCall: SummarizeModelCall = vi.fn(
      async () => "A".repeat(80),
    );
    const title = await summarize("test", modelCall);
    expect(title.length).toBe(50);
  });

  it("falls back to first-line-truncated on model failure", async () => {
    const modelCall: SummarizeModelCall = vi.fn(async () => {
      throw new Error("API down");
    });
    const title = await summarize(
      "Implement the new feature\nWith more details on line two",
      modelCall,
    );
    expect(title).toBe("Implement the new feature");
  });

  it("fallback truncates long first line to 50", async () => {
    const modelCall: SummarizeModelCall = vi.fn(async () => {
      throw new Error("fail");
    });
    const longLine = "A".repeat(80);
    const title = await summarize(longLine, modelCall);
    expect(title.length).toBe(50);
  });

  it("strips quotes from model output", async () => {
    const modelCall: SummarizeModelCall = vi.fn(async () => '"Quoted Title"');
    const title = await summarize("test", modelCall);
    expect(title).toBe("Quoted Title");
  });
});
