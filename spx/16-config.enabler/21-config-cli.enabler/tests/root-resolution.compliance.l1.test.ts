import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProductDir } from "@/domains/config/root";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";

describe("resolveProductDir — inside a git worktree", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
    await runGit(repo, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("returns the worktree root when invoked from the product directory", async () => {
    const resolved = resolveProductDir(repo);
    const expectedRoot = await realpath(repo);

    expect(await realpath(resolved.productDir)).toBe(expectedRoot);
    expect(resolved.warning).toBeUndefined();
  });

  it("returns the worktree root when invoked from a subdirectory", async () => {
    const sub = join(repo, "nested", "deep");
    await mkdir(sub, { recursive: true });

    const resolved = resolveProductDir(sub);
    const expectedRoot = await realpath(repo);

    expect(await realpath(resolved.productDir)).toBe(expectedRoot);
    expect(resolved.warning).toBeUndefined();
  });
});

describe("resolveProductDir — outside a git worktree", () => {
  let nonRepo: string;

  beforeEach(async () => {
    nonRepo = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  });

  afterEach(async () => {
    await rm(nonRepo, { recursive: true, force: true });
  });

  it("falls back to the supplied cwd when git rev-parse finds no worktree", async () => {
    const resolved = resolveProductDir(nonRepo);
    const expectedRoot = await realpath(nonRepo);

    expect(await realpath(resolved.productDir)).toBe(expectedRoot);
  });

  it("emits a warning describing the fallback", () => {
    const resolved = resolveProductDir(nonRepo);

    expect(resolved.warning).toBeDefined();
    expect(resolved.warning?.length ?? 0).toBeGreaterThan(0);
  });
});
