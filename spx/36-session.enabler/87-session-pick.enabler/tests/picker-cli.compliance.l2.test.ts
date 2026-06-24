/**
 * Picker CLI compliance: the non-TTY refusal.
 *
 * Runs the built `spx session pick` through `node bin/spx.js` with piped (non-
 * TTY) stdio — the real packaged executable, no terminal — and asserts it
 * refuses with a diagnostic and a non-zero exit, writing nothing to stdout.
 */
import { sessionCliDefinition } from "@/interfaces/cli/session/definition";
import { PICK_NON_TTY_MESSAGE } from "@/interfaces/cli/session/pick/run-picker";
import { runSessionCli } from "@testing/harnesses/session/harness";
import { describe, expect, it } from "vitest";
const sessionDomain = sessionCliDefinition.domain.commandName;
const sessionPickCommand = sessionCliDefinition.subcommands.pick.commandName;
async function runSpx(args: readonly string[], input: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return runSessionCli(args, input);
}
describe("session pick compliance", () => {
  it("refuses a non-TTY context with a stderr diagnostic and a non-zero exit, writing nothing to stdout", async () => {
    // execa pipes stdin/stdout/stderr, so the child sees no TTY — the gate fires.
    const { stdout, stderr, exitCode } = await runSpx([sessionDomain, sessionPickCommand], "");
    expect(exitCode).not.toBe(0);
    expect(stdout).toHaveLength(0);
    // The diagnostic is the production message verbatim — asserted against the
    // imported constant, not re-typed fragments.
    expect(stderr).toContain(PICK_NON_TTY_MESSAGE);
  });
});
