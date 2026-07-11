import { constants as fsConstants } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DIAGNOSE_DOING_SESSION_ARGS,
  DIAGNOSE_SPX_EXECUTABLE,
  sessionEnvironmentProbeFromSnapshotProvider,
  sessionStoreProbeFromSnapshotProvider,
  worktreePoolProbeFromSnapshotProvider,
  type WorktreePoolSnapshot,
  type WorktreePoolSnapshotProvider,
} from "@/commands/diagnose/probes";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

function snapshotProvider(snapshot: WorktreePoolSnapshot): WorktreePoolSnapshotProvider {
  return {
    async read(): Promise<WorktreePoolSnapshot> {
      return snapshot;
    },
  };
}

describe("diagnose worktree-touching probes comply with the shared snapshot boundary", () => {
  it("never executes worktree status while gathering worktree-touching readings", async () => {
    await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
      const recordPath = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      const executablePath = join(productDir, DIAGNOSE_SPX_EXECUTABLE);
      await writeFile(
        executablePath,
        [
          "#!/usr/bin/env node",
          "const { appendFileSync } = require('node:fs');",
          "appendFileSync(process.env.SPX_DIAGNOSE_RECORD_ARGS, `${JSON.stringify(process.argv.slice(2))}\\n`);",
        ].join("\n"),
      );
      await chmod(
        executablePath,
        fsConstants.S_IRWXU | fsConstants.S_IRGRP | fsConstants.S_IXGRP | fsConstants.S_IROTH | fsConstants.S_IXOTH,
      );

      const priorPath = process.env.PATH;
      const priorRecordPath = process.env.SPX_DIAGNOSE_RECORD_ARGS;
      process.env.PATH = priorPath === undefined ? productDir : `${productDir}${delimiter}${priorPath}`;
      process.env.SPX_DIAGNOSE_RECORD_ARGS = recordPath;
      try {
        const worktreeRoot = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()));
        const defaultBranch = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
        const provider = snapshotProvider({
          errored: false,
          bareRepository: true,
          linkedWorktrees: false,
          mainCheckoutPath: worktreeRoot,
          defaultBranch,
          mainCheckoutBranch: defaultBranch,
          mainCheckoutBranchRead: true,
          worktrees: [
            {
              root: worktreeRoot,
              name: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()),
              status: OCCUPANCY_STATUS.RUNNING,
              sessionId: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
            },
          ],
          currentWorktreeRoot: worktreeRoot,
          liveClaimSessionIds: new Set(),
        });

        await worktreePoolProbeFromSnapshotProvider(provider).probe();
        await sessionEnvironmentProbeFromSnapshotProvider(provider).probe();
        await sessionStoreProbeFromSnapshotProvider(provider).probe();
      } finally {
        process.env.PATH = priorPath;
        process.env.SPX_DIAGNOSE_RECORD_ARGS = priorRecordPath;
      }

      const recorded = (await readFile(recordPath))
        .toString()
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as readonly string[]);
      expect(recorded).toEqual([DIAGNOSE_DOING_SESSION_ARGS]);
    });
  });
});
