/** Assertion harnesses for diagnose consumers of the shared worktree snapshot. */

import { constants as fsConstants } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { expect } from "vitest";

import {
  DIAGNOSE_DOING_SESSION_ARGS,
  DIAGNOSE_SPX_EXECUTABLE,
  gatherWorktreePoolSnapshot,
  sessionEnvironmentProbeFromSnapshotProvider,
  sessionEnvironmentReadingFromSnapshot,
  sessionStoreProbeFromSnapshotProvider,
  sessionStoreReadingFromSnapshot,
  worktreePoolProbeFromSnapshotProvider,
  type WorktreePoolSnapshot,
  type WorktreePoolSnapshotProvider,
} from "@/commands/diagnose/probes";
import { classifySessionEnvironment, SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore, SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import { DEFAULT_SESSION_METADATA, type SessionRecord } from "@/domains/session/list";
import { SESSION_STATUSES } from "@/domains/session/types";
import { OCCUPANCY_STATUS, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import {
  sampleDistinctPathUnsafeAgentSessionIdentities,
  sampleDistinctSessionIds,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

function doingSession(id: string, agentSessionId: string): SessionRecord {
  return {
    id,
    status: SESSION_STATUSES[1],
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
    agent_session_id: agentSessionId,
  };
}

function healthySnapshot(
  worktreeRoot: string,
  status: WorktreePoolSnapshot["worktrees"][number]["status"],
  sessionId?: string,
): WorktreePoolSnapshot {
  const defaultBranch = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  return {
    errored: false,
    bareRepository: true,
    linkedWorktrees: false,
    mainCheckoutPath: worktreeRoot,
    defaultBranch,
    mainCheckoutBranch: defaultBranch,
    mainCheckoutBranchRead: true,
    worktrees: [{
      root: worktreeRoot,
      name: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()),
      status,
      ...(sessionId === undefined ? {} : { sessionId }),
    }],
    currentWorktreeRoot: worktreeRoot,
    liveClaimSessionIds: new Set(sessionId === undefined ? [] : [normalizeAgentSessionToken(sessionId)]),
  };
}

export function assertSessionEnvironmentSnapshotMapping(): void {
  const cases = [
    [OCCUPANCY_STATUS.RUNNING, false, true, true, true, SESSION_ENVIRONMENT_VERDICT.WORKING, VERDICT_BUCKET.HEALTHY],
    [
      OCCUPANCY_STATUS.FREE,
      true,
      true,
      false,
      true,
      SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY,
      VERDICT_BUCKET.DEGRADED,
    ],
    [OCCUPANCY_STATUS.RUNNING, true, false, true, true, SESSION_ENVIRONMENT_VERDICT.WORKING, VERDICT_BUCKET.HEALTHY],
    [OCCUPANCY_STATUS.RUNNING, false, false, true, true, SESSION_ENVIRONMENT_VERDICT.WORKING, VERDICT_BUCKET.HEALTHY],
    [OCCUPANCY_STATUS.RUNNING, true, false, true, false, SESSION_ENVIRONMENT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN],
    [
      OCCUPANCY_STATUS.FREE,
      false,
      false,
      false,
      false,
      SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE,
      VERDICT_BUCKET.NOT_APPLICABLE,
    ],
  ] as const;

  for (const [status, hookPresent, sessionIdentity, worktreeClaimed, includeClaimIdentity, verdict, bucket] of cases) {
    const worktreeRoot = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const snapshot = healthySnapshot(
      worktreeRoot,
      status,
      includeClaimIdentity ? sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()) : undefined,
    );
    const reading = sessionEnvironmentReadingFromSnapshot(snapshot, { hookPresent, sessionIdentity });
    const record = classifySessionEnvironment(reading);

    expect(reading).toEqual({
      errored: false,
      hookPresent,
      sessionIdentity: includeClaimIdentity && worktreeClaimed ? true : sessionIdentity,
      worktreeClaimed,
    });
    expect(record.verdict).toBe(verdict);
    expect(record.bucket).toBe(bucket);
    expect(record.remediation.length).toBeGreaterThan(0);
  }
}

export function assertSessionStoreSnapshotMapping(): void {
  for (const includeOrphanedClaim of [false, true]) {
    const [backedSessionId, orphanedSessionId] = sampleDistinctSessionIds(2);
    const [backingAgentSessionId, orphanedAgentSessionId] = sampleDistinctPathUnsafeAgentSessionIdentities(2);
    const worktreeRoot = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const snapshot = healthySnapshot(worktreeRoot, OCCUPANCY_STATUS.RUNNING, backingAgentSessionId);
    const liveClaimSessionIds = new Set(snapshot.liveClaimSessionIds);
    if (includeOrphanedClaim) liveClaimSessionIds.add(normalizeAgentSessionToken(orphanedAgentSessionId));
    const reading = sessionStoreReadingFromSnapshot({ ...snapshot, liveClaimSessionIds }, [
      doingSession(backedSessionId, backingAgentSessionId),
      doingSession(orphanedSessionId, orphanedAgentSessionId),
    ]);
    const record = classifySessionStore(reading);

    expect(reading).toEqual({ errored: false, orphanedClaims: includeOrphanedClaim ? 0 : 1 });
    expect(record.verdict).toBe(
      includeOrphanedClaim ? SESSION_STORE_VERDICT.CONSISTENT : SESSION_STORE_VERDICT.ORPHANED_CLAIMS,
    );
    expect(record.bucket).toBe(includeOrphanedClaim ? VERDICT_BUCKET.HEALTHY : VERDICT_BUCKET.DEGRADED);
    expect(record.remediation.length).toBeGreaterThan(0);
  }
}

export async function assertExportedClaimBacksDoingSession(): Promise<void> {
  await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const worktreeRoot = join(productDir, worktreeName);
    const worktreesDir = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()));
    const [doingSessionId] = sampleDistinctSessionIds(1);
    const claim = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const written = await writeClaim(worktreesDir, worktreeClaimName(worktreeRoot), claim, {
      fs: defaultOccupancyFileSystem,
      randomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
    });
    if (!written.ok) throw new Error(written.error);

    const facts: GitFacts = {
      worktreeRoot,
      worktreeRoots: [worktreeRoot],
      worktreeListRead: true,
      commonDir: join(productDir, `${worktreeName}${GIT_URL_SUFFIX}`),
      commonDirIsBare: true,
      originUrl: null,
    };
    const snapshot = await gatherWorktreePoolSnapshot({
      env: { [HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH]: written.value },
      gatherGitFacts: async () => facts,
      fs: defaultOccupancyFileSystem,
      processTable: createProcessTable({
        host: claim.host,
        processes: new Map([[claim.pid, { alive: true, startTime: claim.startedAt }]]),
      }),
    });
    const reading = sessionStoreReadingFromSnapshot(snapshot, [doingSession(doingSessionId, claim.sessionId)]);
    const record = classifySessionStore(reading);

    expect(reading).toEqual({ errored: false, orphanedClaims: 0 });
    expect(record.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
    expect(record.bucket).toBe(VERDICT_BUCKET.HEALTHY);
  });
}

function snapshotProvider(snapshot: WorktreePoolSnapshot): WorktreePoolSnapshotProvider {
  return { read: async () => snapshot };
}

export async function assertWorktreeTouchingProbesAvoidStatus(): Promise<void> {
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
      const provider = snapshotProvider(healthySnapshot(
        worktreeRoot,
        OCCUPANCY_STATUS.RUNNING,
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
      ));
      await worktreePoolProbeFromSnapshotProvider(provider).probe();
      await sessionEnvironmentProbeFromSnapshotProvider(provider).probe();
      await sessionStoreProbeFromSnapshotProvider(provider).probe();
    } finally {
      process.env.PATH = priorPath;
      process.env.SPX_DIAGNOSE_RECORD_ARGS = priorRecordPath;
    }

    const recorded = (await readFile(recordPath)).toString().trim().split("\n").map((line) =>
      JSON.parse(line) as readonly string[]
    );
    expect(recorded).toEqual([DIAGNOSE_DOING_SESSION_ARGS]);
  });
}
