/**
 * E2E: Markdown validation CLI tests.
 *
 * Exercises spx validation markdown as a user would — by spawning the CLI
 * binary. Catches registration failures, argument parsing issues, and
 * exit code behavior that unit/integration tests cannot reach.
 *
 * Routing: Stage 4 → Level 3. Real CLI binary, real process, real exit codes.
 */

import { execa } from "execa";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "@test/harness/constants";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mdlint-e2e-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("spx validation markdown (e2e)", () => {
  it("GIVEN a user runs spx validation markdown, THEN the command is registered and executes", async () => {
    const { exitCode, stdout } = await execa(
      "node",
      [CLI_PATH, "validation", "markdown", "--help"],
      { reject: false },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("markdown");
    expect(stdout).toContain("Validate markdown link integrity");
  });

  it("GIVEN a directory with a broken link, WHEN spx validation markdown runs, THEN exits 1 with the broken link identified", async () => {
    const spxDir = join(tempDir, "spx");
    await mkdir(spxDir, { recursive: true });
    await writeFile(
      join(spxDir, "test.md"),
      "# Test\n\n[broken](./nonexistent.md)\n",
    );

    const { exitCode, stdout } = await execa(
      "node",
      [CLI_PATH, "validation", "markdown", "--files", spxDir],
      { reject: false },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("nonexistent.md");
  });

  it("GIVEN a directory with valid links, WHEN spx validation markdown runs, THEN exits 0", async () => {
    const spxDir = join(tempDir, "spx");
    await mkdir(spxDir, { recursive: true });
    await writeFile(join(spxDir, "target.md"), "# Target\n\nContent.\n");
    await writeFile(
      join(spxDir, "source.md"),
      "# Source\n\n[valid](./target.md)\n",
    );

    const { exitCode } = await execa(
      "node",
      [CLI_PATH, "validation", "markdown", "--files", spxDir],
      { reject: false },
    );

    expect(exitCode).toBe(0);
  });
});
