import { describe, it, expect, beforeEach } from "vitest";
import { createTitleStore } from "../src/store.js";

describe("TitleStore (in-memory)", () => {
  let store: ReturnType<typeof createTitleStore>;

  beforeEach(() => {
    store = createTitleStore(":memory:");
  });

  it("returns undefined for unknown sessions", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("inserts and retrieves a first message", () => {
    store.insertFirstMessage("sess-1", "Hello world");
    const row = store.get("sess-1");
    expect(row).toBeDefined();
    expect(row!.sessionId).toBe("sess-1");
    expect(row!.firstMessage).toBe("Hello world");
    expect(row!.title).toBeNull();
    expect(row!.createdAt).toBeGreaterThan(0);
  });

  it("updates title on an existing row", () => {
    store.insertFirstMessage("sess-1", "Hello");
    store.updateTitle("sess-1", "Greeting");
    const row = store.get("sess-1");
    expect(row!.title).toBe("Greeting");
    expect(row!.updatedAt).toBeGreaterThan(0);
  });

  it("updateTitle is a no-op for nonexistent sessions", () => {
    // Should not throw
    store.updateTitle("nonexistent", "Title");
  });

  it("insertFirstMessage sets createdAt but not updatedAt", () => {
    store.insertFirstMessage("sess-1", "msg");
    const row = store.get("sess-1");
    expect(row!.createdAt).toBeTruthy();
    expect(row!.updatedAt).toBeNull();
  });

  it("isolates sessions from each other", () => {
    store.insertFirstMessage("a", "msg a");
    store.insertFirstMessage("b", "msg b");
    store.updateTitle("a", "title a");

    expect(store.get("a")!.title).toBe("title a");
    expect(store.get("b")!.title).toBeNull();
  });
});
