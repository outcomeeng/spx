import { execa } from "execa";
import * as fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_PATH = join(process.cwd(), "dist", "cli.js");
const SUBPROCESS_TIMEOUT_MS = 10_000;
const PROPERTY_RUN_COUNT = 15;
const PROPERTY_TIMEOUT_MS = 60_000;
const UNKNOWN_TAG = "unknown subcommand";

const REGISTERED_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "typescript",
  "ts",
  "lint",
  "circular",
  "knip",
  "literal",
  "markdown",
  "md",
  "all",
  "help",
  "--help",
  "-h",
]);

async function runValidation(
  candidate: string,
): Promise<{ exitCode: number; stderr: string }> {
  const result = await execa("node", [CLI_PATH, "validation", candidate], {
    reject: false,
    timeout: SUBPROCESS_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode ?? -1,
    stderr: result.stderr,
  };
}

describe("spx validation dispatch — invariant over non-matching argument strings", () => {
  it(
    "every non-registered subcommand string yields non-zero exit and reaches the unknown-subcommand diagnostic path",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 40 })
            .filter((s) => !REGISTERED_SUBCOMMANDS.has(s))
            .filter((s) => !s.startsWith("-")),
          async (candidate) => {
            const { exitCode, stderr } = await runValidation(candidate);
            expect(exitCode).not.toBe(0);
            expect(stderr).toContain(UNKNOWN_TAG);
          },
        ),
        { numRuns: PROPERTY_RUN_COUNT },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );
});
