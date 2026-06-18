/**
 * Picker CLI compliance: the non-TTY refusal.
 *
 * Runs the built `spx session pick` through `node bin/spx.js` with piped (non-
 * TTY) stdio — the real packaged executable, no terminal — and asserts it
 * refuses with a diagnostic and a non-zero exit, writing nothing to stdout.
 */

import { join } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

const CLI_ENTRY = join(process.cwd(), "bin/spx.js");

async function runSpx(
  args: readonly string[],
  input: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], { input, reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

describe("session pick compliance", () => {
  it("refuses a non-TTY context with a stderr diagnostic and a non-zero exit, writing nothing to stdout", async () => {
    // execa pipes stdin/stdout/stderr, so the child sees no TTY — the gate fires.
    const { stdout, stderr, exitCode } = await runSpx(["session", "pick"], "");

    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("interactive terminal");
    // The spec requires suggesting both `session pickup --auto` and `session pickup <id>`.
    expect(stderr).toContain("session pickup --auto");
    expect(stderr).toContain("session pickup <id>");
  });
});
