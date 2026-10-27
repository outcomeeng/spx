/**
 * Sweep and removal-bound compliance over a real filesystem seeded with the leftovers an earlier run
 * left and with bystander entries the primitive must never touch. A recording wrapper over the real
 * filesystem dependency reports every directory the primitive listed and every path it removed.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { worktreeScopeDir } from "@/lib/state-store";
import { TEMP_DIRECTORY_ENV_VAR, TEMP_DIRECTORY_PATH, TempDirectoryBoundError } from "@/lib/temp-directory";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryEntryName,
  arbitraryForeignScratchNames,
  arbitraryLeftoverRunRootNames,
  arbitraryLeftoverScratchNames,
  arbitraryProductSegments,
} from "@testing/generators/temp-directory/temp-directory";
import { withTempDirectoryHost } from "@testing/harnesses/temp-directory/temp-directory";

describe("a run's first scratch request for a parent inside its worktree", () => {
  it("removes every leftover scratch entry and keeps entries of other tools and the run's own directories", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const productDirectory = host.createProductDirectory(
        run.worktreeRoot,
        sampleGeneratedValue(arbitraryProductSegments()),
      );
      const scratchParent = join(productDirectory, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS);
      const leftoverNames = sampleGeneratedValue(arbitraryLeftoverScratchNames());
      const foreignNames = sampleGeneratedValue(arbitraryForeignScratchNames());
      for (const name of [...leftoverNames, ...foreignNames]) {
        host.seedLeftover(join(scratchParent, name));
      }

      const first = await run.tempDirectory.createScratchDirectory(productDirectory);
      const second = await run.tempDirectory.createScratchDirectory(productDirectory);

      for (const name of leftoverNames) {
        expect(existsSync(join(scratchParent, name))).toBe(false);
      }
      for (const name of foreignNames) {
        expect(existsSync(join(scratchParent, name))).toBe(true);
      }
      expect(existsSync(first)).toBe(true);
      expect(existsSync(second)).toBe(true);
    });
  });
});

describe("the primitive's reads and removals", () => {
  it("list only the run-root directory and scratch parents and remove only entries inside them", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const runRoots = join(worktreeScopeDir(run.worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
      const productDirectory = host.createProductDirectory(
        run.worktreeRoot,
        sampleGeneratedValue(arbitraryProductSegments()),
      );
      const scratchParent = join(productDirectory, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS);
      const stateBystander = join(worktreeScopeDir(run.worktreeRoot), sampleGeneratedValue(arbitraryEntryName()));
      const productBystander = join(productDirectory, sampleGeneratedValue(arbitraryEntryName()));
      host.seedLeftover(stateBystander);
      host.seedLeftover(productBystander);
      for (const name of sampleGeneratedValue(arbitraryLeftoverRunRootNames())) {
        host.seedLeftover(join(runRoots, name));
      }
      for (const name of sampleGeneratedValue(arbitraryLeftoverScratchNames())) {
        host.seedLeftover(join(scratchParent, name));
      }

      await run.tempDirectory.createDirectory();
      await run.tempDirectory.createScratchDirectory(productDirectory);

      expect(run.removed.length).toBeGreaterThan(0);
      for (const listed of run.listed) {
        expect([runRoots, scratchParent]).toContain(listed);
      }
      for (const removed of run.removed) {
        expect(removed.startsWith(`${runRoots}${sep}`) || removed.startsWith(`${scratchParent}${sep}`)).toBe(true);
      }
      expect(existsSync(stateBystander)).toBe(true);
      expect(existsSync(productBystander)).toBe(true);
    });
  });

  it("neither list nor remove anything in another worktree", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const otherWorktree = host.createWorktree();
      const otherRunRoots = join(worktreeScopeDir(otherWorktree), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
      const otherProduct = host.createProductDirectory(otherWorktree, sampleGeneratedValue(arbitraryProductSegments()));
      const otherScratchParent = join(otherProduct, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS);
      const otherRunRootEntries = sampleGeneratedValue(arbitraryLeftoverRunRootNames());
      const otherScratchEntries = sampleGeneratedValue(arbitraryLeftoverScratchNames());
      for (const name of otherRunRootEntries) {
        host.seedLeftover(join(otherRunRoots, name));
      }
      for (const name of otherScratchEntries) {
        host.seedLeftover(join(otherScratchParent, name));
      }

      await run.tempDirectory.createDirectory();
      await run.tempDirectory.createScratchDirectory(otherProduct);

      expect(readdirSync(otherRunRoots)).toHaveLength(otherRunRootEntries.length);
      expect(readdirSync(otherRunRoots)).toEqual(expect.arrayContaining(otherRunRootEntries));
      expect(readdirSync(otherScratchParent)).toHaveLength(otherScratchEntries.length);
      expect(readdirSync(otherScratchParent)).toEqual(expect.arrayContaining(otherScratchEntries));
      expect(run.listed).not.toContain(otherRunRoots);
      expect(run.listed).not.toContain(otherScratchParent);
      expect(run.removed.some((removed) => removed.startsWith(otherWorktree))).toBe(false);
    });
  });

  it("refuse the release of a path outside the run root and the scratch parent, and leave it in place", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const runRoots = join(worktreeScopeDir(run.worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
      await run.tempDirectory.createDirectory();
      const [runRootName] = readdirSync(runRoots);
      const productDirectory = host.createProductDirectory(
        run.worktreeRoot,
        sampleGeneratedValue(arbitraryProductSegments()),
      );
      const rootPrefixSibling = `${join(runRoots, runRootName)}${sampleGeneratedValue(arbitraryEntryName())}`;
      const productBystander = join(productDirectory, sampleGeneratedValue(arbitraryEntryName()));
      host.seedLeftover(rootPrefixSibling);
      host.seedLeftover(productBystander);

      expect(() => run.tempDirectory.releaseDirectory(rootPrefixSibling)).toThrow(TempDirectoryBoundError);
      expect(() => run.tempDirectory.releaseDirectory(productBystander)).toThrow(TempDirectoryBoundError);
      expect(() => run.tempDirectory.releaseScratchDirectory(productBystander)).toThrow(TempDirectoryBoundError);

      expect(existsSync(rootPrefixSibling)).toBe(true);
      expect(existsSync(productBystander)).toBe(true);
      expect(run.removed).not.toContain(rootPrefixSibling);
      expect(run.removed).not.toContain(productBystander);
      expect(run.environment.get(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT)).toBe(join(runRoots, runRootName));
    });
  });
});
