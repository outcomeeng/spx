import { Command, CommanderError } from "commander";
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LITERAL_PROBLEM_KIND } from "@/commands/validation";
import {
  allValidationCliOptions,
  literalValidationCliOptions,
  validationCliDefinition,
  validationDomain,
} from "@/domains/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";

const CLI_PATH = join(process.cwd(), "bin", "spx.js");
const SUBPROCESS_TIMEOUT_MS = 10_000;
const UNKNOWN_TAG = validationCliDefinition.diagnostics.unknownSubcommand.messageLabel;
const UNKNOWN_LITERAL_PROBLEM_KIND_TAG = validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel;
const TEMP_DIR_PREFIX = "spx-validation-literal-kind-";

async function runValidation(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const result = await execa("node", [CLI_PATH, "validation", ...args], {
    cwd: options.cwd,
    reject: false,
    timeout: SUBPROCESS_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode ?? -1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function runValidationInProcess(
  args: readonly string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const program = new Command();
  const stdout: string[] = [];
  const stderr: string[] = [];

  program.exitOverride();
  program.configureOutput({
    writeErr: (value) => stderr.push(value),
    writeOut: (value) => stdout.push(value),
  });
  validationDomain.register(program);

  try {
    await program.parseAsync(["node", "spx", "validation", ...args], { from: "node" });
    return {
      exitCode: 0,
      stderr: stderr.join(""),
      stdout: stdout.join(""),
    };
  } catch (error) {
    if (isCommanderExit(error)) {
      return {
        exitCode: error.exitCode,
        stderr: stderr.join(""),
        stdout: stdout.join(""),
      };
    }
    throw error;
  }
}

function isCommanderExit(error: unknown): error is CommanderError {
  return error instanceof CommanderError;
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

  it("literal help lists the literal-specific flags and valid problem kinds accepted by the handler", async () => {
    const result = await runValidationInProcess(["literal", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    expect(result.stdout).toContain(literalValidationCliOptions.allowlistExisting.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.kind.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.filesWithProblems.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.literals.flag);
    expect(result.stdout).toContain(literalValidationCliOptions.verbose.flag);
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.REUSE);
    expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.DUPE);
  });

  it("validation all help lists the literal skip flag accepted by the handler", async () => {
    const result = await runValidationInProcess(["all", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    expect(result.stdout).toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("literal help does not list the full-pipeline literal skip flag", async () => {
    const result = await runValidationInProcess(["literal", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    expect(result.stdout).not.toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("literal command rejects the full-pipeline literal skip flag", async () => {
    const result = await runValidationInProcess(["literal", allValidationCliOptions.skipLiteral.flag]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toContain(allValidationCliOptions.skipLiteral.flag);
  });

  it("unknown literal problem kind is rejected before detection with a sanitized diagnostic", async () => {
    const emptyProjectRoot = await mkdtemp(join(tmpdir(), TEMP_DIR_PREFIX));
    const unsafeKind = "bad\x01kind";
    try {
      const result = await runValidation(["literal", "--kind", unsafeKind], { cwd: emptyProjectRoot });
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(UNKNOWN_LITERAL_PROBLEM_KIND_TAG);
      expect(result.stderr).toContain(sanitizeCliArgument(unsafeKind));
      expect(result.stderr).not.toContain(unsafeKind);
    } finally {
      await rm(emptyProjectRoot, { force: true, recursive: true });
    }
  });
});
