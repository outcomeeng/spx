import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { gatherWorktreePoolSnapshot, worktreePoolReadingFromSnapshot } from "@/commands/diagnose/probes";
import { classifyWorktreePool, WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

describe("the worktree-pool snapshot preserves layout verdicts when free worktrees are added", () => {
  it("keeps a compliant layout healthy when adding a never-claimed or dead-claimed worktree", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          worktreeNames: fc.uniqueArray(WORKTREE_TEST_GENERATOR.poolWorktreeName(), { minLength: 3, maxLength: 3 }),
          sessionIds: WORKTREE_TEST_GENERATOR.distinctSessionIds(),
          pids: WORKTREE_TEST_GENERATOR.distinctPids(),
          startTimes: WORKTREE_TEST_GENERATOR.distinctStartTimes(),
          host: WORKTREE_TEST_GENERATOR.host(),
          randomBytesPair: WORKTREE_TEST_GENERATOR.distinctRandomBytes(),
          tempPrefix: WORKTREE_TEST_GENERATOR.tempPrefix(),
        }),
        async ({ worktreeNames, sessionIds, pids, startTimes, host, randomBytesPair, tempPrefix }) => {
          const [runningName, freeName, deadName] = worktreeNames;
          const [liveSessionId, deadSessionId] = sessionIds;
          const [livePid, deadPid] = pids;
          const [liveStartedAt, deadStartedAt] = startTimes;

          await withTempDir(tempPrefix, async (productDir) => {
            const runningRoot = join(productDir, runningName);
            const freeRoot = join(productDir, freeName);
            const deadRoot = join(productDir, deadName);
            const commonDir = join(productDir, `${runningName}${GIT_URL_SUFFIX}`);
            const worktreesDir = worktreesScopeDir(productDir);
            const liveClaim = {
              sessionId: liveSessionId,
              host,
              pid: livePid,
              startedAt: liveStartedAt,
            };
            const deadClaim = {
              sessionId: deadSessionId,
              host,
              pid: deadPid,
              startedAt: deadStartedAt,
            };
            const processTable = createProcessTable({
              host,
              processes: new Map([[livePid, { alive: true, startTime: liveStartedAt }]]),
            });

            await writeClaim(worktreesDir, worktreeClaimName(runningRoot), liveClaim, {
              fs: defaultOccupancyFileSystem,
              randomBytes: randomBytesPair[0],
            });

            async function gather(worktreeRoots: readonly string[]): Promise<ReturnType<typeof classifyWorktreePool>> {
              const facts: GitFacts = {
                worktreeRoot: runningRoot,
                worktreeRoots,
                worktreeListRead: true,
                commonDir,
                commonDirIsBare: true,
                originUrl: null,
              };
              const snapshot = await gatherWorktreePoolSnapshot({
                gatherGitFacts: async () => facts,
                fs: defaultOccupancyFileSystem,
                processTable,
              });
              return classifyWorktreePool(worktreePoolReadingFromSnapshot(snapshot));
            }

            const baseRecord = await gather([runningRoot]);
            const freeRecord = await gather([runningRoot, freeRoot]);

            await writeClaim(worktreesDir, worktreeClaimName(deadRoot), deadClaim, {
              fs: defaultOccupancyFileSystem,
              randomBytes: randomBytesPair[1],
            });
            const deadRecord = await gather([runningRoot, deadRoot]);

            expect(baseRecord.verdict).toBe(WORKTREE_POOL_VERDICT.COMPLIANT);
            expect(baseRecord.bucket).toBe(VERDICT_BUCKET.HEALTHY);
            expect(baseRecord.readings).toMatchObject({ running: "1", free: "0" });
            expect(freeRecord.verdict).toBe(baseRecord.verdict);
            expect(freeRecord.bucket).toBe(baseRecord.bucket);
            expect(freeRecord.readings).toMatchObject({ running: "1", free: "1" });
            expect(deadRecord.verdict).toBe(baseRecord.verdict);
            expect(deadRecord.bucket).toBe(baseRecord.bucket);
            expect(deadRecord.readings).toMatchObject({ running: "1", free: "1" });
          });
        },
      ),
      { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
    );
  });
});
