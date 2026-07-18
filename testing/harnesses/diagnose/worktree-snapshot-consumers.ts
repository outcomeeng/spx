/** Assertion harnesses for diagnose consumers of the shared worktree snapshot. */

import { constants as fsConstants } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import fc from "fast-check";
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
import {
  classifySessionStore,
  doingSessionBackedByClaim,
  SESSION_STORE_VERDICT,
} from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import { DEFAULT_SESSION_METADATA, type SessionRecord } from "@/domains/session/list";
import { SESSION_STATUSES } from "@/domains/session/types";
import { OCCUPANCY_STATUS, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { sessionCliDefinition } from "@/interfaces/cli/session/definition";
import { GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleDiagnoseTestValue } from "@testing/generators/diagnose/manifest";
import {
  sampleDistinctPathUnsafeAgentSessionIdentities,
  sampleDistinctSessionIds,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  runTsxEval,
} from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

const MAIN_CHECKOUT_PROBE_CWD_ENV = "SPX_DIAGNOSE_MAIN_CHECKOUT_PROBE_CWD";
const MAIN_CHECKOUT_PROBE_BRANCH_ENV = "SPX_DIAGNOSE_MAIN_CHECKOUT_PROBE_BRANCH";

interface MainCheckoutProbeResult {
  readonly branch: string | null;
  readonly read: boolean;
}

async function readMainCheckoutBranchInChildProcess(
  cwd: string,
  branch: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<MainCheckoutProbeResult> {
  const script = `
    import { basename, dirname, join } from "node:path";
    import { gatherWorktreePoolSnapshot } from "@/commands/diagnose/probes";
    import { GIT_URL_SUFFIX } from "@/lib/git/root";
    import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
    import { defaultProcessTable } from "@/lib/worktree-process-table";

    async function main() {
      const cwd = process.env.${MAIN_CHECKOUT_PROBE_CWD_ENV};
      const branch = process.env.${MAIN_CHECKOUT_PROBE_BRANCH_ENV};
      if (cwd === undefined || branch === undefined) throw new Error("Missing main-checkout probe input");
      const repositoryName = basename(cwd);
      const snapshot = await gatherWorktreePoolSnapshot({
        env: {},
        gatherGitFacts: async () => ({
          worktreeRoot: cwd,
          worktreeRoots: [cwd],
          worktreeListRead: true,
          commonDir: join(dirname(cwd), \`\${repositoryName}\${GIT_URL_SUFFIX}\`),
          commonDirIsBare: true,
          originUrl: \`\${repositoryName}\${GIT_URL_SUFFIX}\`,
        }),
        resolveDefaultBranch: async () => branch,
        fs: defaultOccupancyFileSystem,
        processTable: defaultProcessTable,
      });
      console.log(JSON.stringify({ branch: snapshot.mainCheckoutBranch, read: snapshot.mainCheckoutBranchRead }));
    }

    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  return JSON.parse(
    await runTsxEval(process.cwd(), script, {
      ...envOverrides,
      [MAIN_CHECKOUT_PROBE_CWD_ENV]: cwd,
      [MAIN_CHECKOUT_PROBE_BRANCH_ENV]: branch,
    }),
  ) as MainCheckoutProbeResult;
}

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

export function assertSessionStoreClassificationMapping(): void {
  const orphanedClaims = sampleDiagnoseTestValue(fc.integer({ min: 1 }));
  const unknown = classifySessionStore({ errored: true, orphanedClaims: 0 });
  const consistent = classifySessionStore({ errored: false, orphanedClaims: 0 });
  const consistentWithOrphans = classifySessionStore({
    errored: false,
    orphanedClaims,
  });

  expect(unknown.verdict).toBe(SESSION_STORE_VERDICT.UNKNOWN);
  expect(unknown.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
  expect(unknown.remediation.length).toBeGreaterThan(0);
  expect(consistent.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
  expect(consistent.bucket).toBe(VERDICT_BUCKET.HEALTHY);
  expect(consistent.remediation.length).toBeGreaterThan(0);
  expect(consistentWithOrphans.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
  expect(consistentWithOrphans.bucket).toBe(VERDICT_BUCKET.HEALTHY);
  expect(Object.values(consistentWithOrphans.readings)).toEqual([String(orphanedClaims)]);
  expect(consistentWithOrphans.remediation).toBe(consistent.remediation);
  expect(unknown.remediation).not.toContain(sessionCliDefinition.subcommands.release.commandName);
  expect(consistent.remediation).not.toContain(sessionCliDefinition.subcommands.release.commandName);
  expect(consistentWithOrphans.remediation).not.toContain(sessionCliDefinition.subcommands.release.commandName);
}

export function assertDoingSessionClaimMapping(): void {
  const [sessionId, agentSessionId] = sampleDistinctSessionIds(2);
  const session = doingSession(sessionId, agentSessionId);
  const sessionWithoutAgentSessionId: SessionRecord = {
    id: sampleDistinctSessionIds(1)[0],
    status: SESSION_STATUSES[1],
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
  };

  expect(doingSessionBackedByClaim(session, new Set([session.id]))).toBe(true);
  expect(doingSessionBackedByClaim(session, new Set([agentSessionId]))).toBe(true);
  expect(doingSessionBackedByClaim(sessionWithoutAgentSessionId, new Set([sessionWithoutAgentSessionId.id]))).toBe(
    true,
  );
  expect(doingSessionBackedByClaim(session, new Set())).toBe(false);
  expect(doingSessionBackedByClaim(sessionWithoutAgentSessionId, new Set())).toBe(false);
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
    expect(record.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
    expect(record.bucket).toBe(VERDICT_BUCKET.HEALTHY);
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

export async function assertMainCheckoutBranchProbeIgnoresGitEnvironment(): Promise<void> {
  await withGitWorktreeEnv(async (env) => {
    const branch = await env.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT]);
    const result = await readMainCheckoutBranchInChildProcess(env.productDir, branch, {
      [GIT_TEST_ENVIRONMENT_KEYS.DIR]: join(
        env.productDir,
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      ),
      [GIT_TEST_ENVIRONMENT_KEYS.WORK_TREE]: join(
        env.productDir,
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      ),
    });

    expect(result).toEqual({ branch, read: true });
  });
}
