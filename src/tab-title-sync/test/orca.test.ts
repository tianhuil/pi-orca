import { describe, it, expect } from "vitest";
import { buildRenameArgs, buildCreateArgs, getTerminalHandle, ORCA_HANDLE_ENV } from "../src/orca.js";

describe("buildRenameArgs", () => {
  it("produces the correct arg list for a rename", () => {
    const args = buildRenameArgs("handle-123", "My Title");
    expect(args).toEqual([
      "terminal", "rename",
      "--terminal", "handle-123",
      "--title", "My Title",
      "--json",
    ]);
  });
});

describe("buildCreateArgs", () => {
  it("produces the correct arg list for a spawn", () => {
    const args = buildCreateArgs("Pi");
    expect(args).toEqual([
      "terminal", "create",
      "--worktree", "active",
      "--command", "pi",
      "--title", "Pi",
      "--json",
    ]);
  });
});

describe("getTerminalHandle", () => {
  it("returns undefined when env var is not set", () => {
    // Save and restore
    const original = process.env[ORCA_HANDLE_ENV];
    delete process.env[ORCA_HANDLE_ENV];
    expect(getTerminalHandle()).toBeUndefined();
    if (original !== undefined) process.env[ORCA_HANDLE_ENV] = original;
  });

  it("returns the handle when env var is set", () => {
    const original = process.env[ORCA_HANDLE_ENV];
    process.env[ORCA_HANDLE_ENV] = "my-handle";
    expect(getTerminalHandle()).toBe("my-handle");
    if (original !== undefined) process.env[ORCA_HANDLE_ENV] = original;
    else delete process.env[ORCA_HANDLE_ENV];
  });
});
