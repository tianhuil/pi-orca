/**
 * Orca CLI interaction — rename, create, and handle resolution.
 *
 * All command execution is injectable via the Executor type so tests
 * can assert on args without running real Orca commands.
 */

export const ORCA_HANDLE_ENV = "ORCA_TERMINAL_HANDLE";

export type Executor = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; code: number }>;

/**
 * Read the Orca terminal handle from the environment, if any.
 */
export function getTerminalHandle(): string | undefined {
  return process.env[ORCA_HANDLE_ENV];
}

/**
 * Build the argument list for `orca terminal rename`.
 */
export function buildRenameArgs(handle: string, title: string): string[] {
  return [
    "terminal",
    "rename",
    "--terminal",
    handle,
    "--title",
    title,
    "--json",
  ];
}

/**
 * Build the argument list for `orca terminal create` (spawn).
 */
export function buildCreateArgs(title: string): string[] {
  return [
    "terminal",
    "create",
    "--worktree",
    "active",
    "--command",
    "pi",
    "--title",
    title,
    "--json",
  ];
}

/**
 * Rename an Orca tab. Silently no-ops if the handle is missing
 * (pi is running outside Orca).
 */
export async function renameTerminal(
  executor: Executor,
  handle: string,
  title: string,
): Promise<void> {
  const args = buildRenameArgs(handle, title);
  await executor("orca", args);
}

/**
 * Create a new Orca tab. Returns the raw JSON output.
 * Throws if the handle is missing (pi is running outside Orca).
 */
export async function createTerminal(
  executor: Executor,
  title: string,
): Promise<string> {
  const args = buildCreateArgs(title);
  const result = await executor("orca", args);
  if (result.code !== 0) {
    throw new Error(`orca terminal create failed: exit ${result.code}`);
  }
  return result.stdout;
}
