import { execa } from "execa";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProjectRoot } from "@/domains/config/root";

const TEMP_PREFIX = "spx-config-root-";

describe("resolveProjectRoot — inside a git worktree", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    await execa("git", ["init", "--quiet", repo]);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("returns the worktree root when invoked from the repo root", async () => {
    const resolved = resolveProjectRoot(repo);
    const expectedRoot = await realpath(repo);

    expect(await realpath(resolved.projectRoot)).toBe(expectedRoot);
    expect(resolved.warning).toBeUndefined();
  });

  it("returns the worktree root when invoked from a subdirectory", async () => {
    const sub = join(repo, "nested", "deep");
    await mkdir(sub, { recursive: true });

    const resolved = resolveProjectRoot(sub);
    const expectedRoot = await realpath(repo);

    expect(await realpath(resolved.projectRoot)).toBe(expectedRoot);
    expect(resolved.warning).toBeUndefined();
  });
});

describe("resolveProjectRoot — outside a git worktree", () => {
  let nonRepo: string;

  beforeEach(async () => {
    nonRepo = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  });

  afterEach(async () => {
    await rm(nonRepo, { recursive: true, force: true });
  });

  it("falls back to the supplied cwd when git rev-parse finds no worktree", async () => {
    const resolved = resolveProjectRoot(nonRepo);
    const expectedRoot = await realpath(nonRepo);

    expect(await realpath(resolved.projectRoot)).toBe(expectedRoot);
  });

  it("emits a warning describing the fallback", () => {
    const resolved = resolveProjectRoot(nonRepo);

    expect(resolved.warning).toBeDefined();
    expect(resolved.warning?.length ?? 0).toBeGreaterThan(0);
  });
});
