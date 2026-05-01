import { execa } from "execa";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validationCliDefinition } from "@/domains/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";

const CLI_PATH = join(process.cwd(), "bin", "spx.js");
const SUBPROCESS_TIMEOUT_MS = 10_000;
const UNKNOWN_TAG = validationCliDefinition.diagnostics.unknownSubcommand.messageLabel;

async function runValidation(
  args: readonly string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const result = await execa("node", [CLI_PATH, "validation", ...args], {
    reject: false,
    timeout: SUBPROCESS_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode ?? -1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe("spx validation dispatch — observable scenarios", () => {
  it("registered subcommand runs its handler: `validation all` returns a non-error exit (success or stage failure, not dispatch failure)", async () => {
    const result = await runValidation(["all"]);
    expect(result.stderr).not.toContain(UNKNOWN_TAG);
  });

  it("unknown subcommand: no stage runs, stderr names the sanitized argument, exit code is non-zero", async () => {
    const unknownStage = "not-a-real-stage-xyz";
    const result = await runValidation([unknownStage]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(UNKNOWN_TAG);
    expect(result.stderr).toContain(unknownStage);
  });

  it("empty-string argument: stderr shows the empty-value sentinel, exit code is non-zero", async () => {
    const result = await runValidation([""]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(SENTINEL_EMPTY);
  });

  it("ASCII control characters in the argument: stderr shows each as its \\xNN escape, no stage runs", async () => {
    const unsafeArgument = "bad\x01arg\x1fend";
    const result = await runValidation([unsafeArgument]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(sanitizeCliArgument("\x01"));
    expect(result.stderr).toContain(sanitizeCliArgument("\x1f"));
    // eslint-disable-next-line no-control-regex -- the raw control chars must NOT appear in stderr
    expect(result.stderr).not.toMatch(/bad\x01arg/);
  });

  it("multi-byte Unicode in the argument: stderr preserves non-control code points verbatim", async () => {
    const unicodeArgument = "¡unicode-🎉-日本語!";
    const result = await runValidation([unicodeArgument]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(unicodeArgument);
  });
});
