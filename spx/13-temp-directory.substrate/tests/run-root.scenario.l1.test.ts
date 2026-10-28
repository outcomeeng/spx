/**
 * Run-root scenarios: the first request in a process with no inherited root sweeps the worktree's
 * run-root directory and creates one root, a request in a process that inherits an exported root
 * creates inside it and removes nothing, and a real child process that created a root removes the
 * root and everything inside it when it ends normally.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { worktreeScopeDir } from "@/lib/state-store";
import { TEMP_DIRECTORY_ENV_VAR, TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryEntryName, arbitraryLeftoverRunRootNames } from "@testing/generators/temp-directory/temp-directory";
import { TEMP_DIRECTORY_CHILD_MODE } from "@testing/harnesses/temp-directory/child-protocol";
import { runTempDirectoryChild } from "@testing/harnesses/temp-directory/process";
import { withTempDirectoryHost } from "@testing/harnesses/temp-directory/temp-directory";

describe("a process with no inherited root", () => {
  it("removes every earlier directory, creates one run root, and creates the directory inside it", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const runRoots = join(worktreeScopeDir(run.worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
      const leftoverNames = sampleGeneratedValue(arbitraryLeftoverRunRootNames());
      for (const name of leftoverNames) {
        host.seedLeftover(join(runRoots, name));
      }

      const directory = await run.tempDirectory.createDirectory();

      const entries = readdirSync(runRoots);
      expect(entries).toHaveLength(1);
      const [rootName] = entries;
      expect(leftoverNames).not.toContain(rootName);
      expect(rootName.startsWith(TEMP_DIRECTORY_PATH.RUN_ROOT_PREFIX)).toBe(true);
      expect(rootName.length).toBeGreaterThan(TEMP_DIRECTORY_PATH.RUN_ROOT_PREFIX.length);
      expect(directory.startsWith(`${join(runRoots, rootName)}${sep}`)).toBe(true);
      expect(existsSync(directory)).toBe(true);
      expect(run.environment.get(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT)).toBe(join(runRoots, rootName));
    });
  });
});

describe("a child process that inherits a root exported by its parent", () => {
  it("creates the directory inside the inherited root, creates no root, and removes no other directory", async () => {
    await withTempDirectoryHost(async (host) => {
      const parent = host.openRun();
      const runRoots = join(worktreeScopeDir(parent.worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
      await parent.tempDirectory.createDirectory();
      const [parentRootName] = readdirSync(runRoots);
      const inheritedRoot = join(runRoots, parentRootName);
      const otherName = sampleGeneratedValue(arbitraryEntryName());
      host.seedLeftover(join(runRoots, otherName));
      const entriesBefore = readdirSync(runRoots);

      const child = host.openRun({ worktreeRoot: parent.worktreeRoot, inheritFrom: parent });
      const directory = await child.tempDirectory.createDirectory();

      expect(directory.startsWith(`${inheritedRoot}${sep}`)).toBe(true);
      expect(existsSync(directory)).toBe(true);
      expect(readdirSync(runRoots)).toHaveLength(entriesBefore.length);
      expect(readdirSync(runRoots)).toEqual(expect.arrayContaining(entriesBefore));
      expect(existsSync(join(runRoots, otherName))).toBe(true);
      expect(child.removed).toEqual([]);
    });
  });
});

describe("a process that created a run root and ends normally", () => {
  it("leaves neither the root nor anything inside it", async () => {
    const run = await runTempDirectoryChild(TEMP_DIRECTORY_CHILD_MODE.CREATE);

    expect(run.exitCode).toBe(0);
    expect(run.report.root).toBeDefined();
    expect(run.report.rootExistedWhileRunning).toBe(true);
    expect(run.report.contentExistedWhileRunning).toBe(true);
    expect(run.rootExistsAfterExit).toBe(false);
    expect(run.directoryExistsAfterExit).toBe(false);
  });
});
