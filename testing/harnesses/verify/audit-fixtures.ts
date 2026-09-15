import { execa } from "execa";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { journalReadCommand } from "@/commands/journal/cli";
import {
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  type VerifyFinishCliOptions,
  verifyFinishCommand,
  type VerifyInputCliOptions,
} from "@/commands/verify/cli";
import { type AuditScopeUnit, VERIFY_VERIFICATION_TYPE, type VerifyVerificationType } from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { defaultStateStoreFileSystem } from "@/lib/state-store";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  runGit,
} from "@testing/harnesses/git-test-constants";
import {
  createRecordingStreamSink,
  createVerifyRunContextScenario,
  startedRunToken,
  verifyAppendOptions,
  withFileScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const FIXTURE_DIR = resolve(import.meta.dirname, "../../fixtures/verify/audit");
export const AUDIT_FIXTURE = {
  TERMINAL_VALID: resolve(FIXTURE_DIR, "terminal-valid.json"),
  TERMINAL_METADATA: resolve(FIXTURE_DIR, "terminal-metadata.json"),
  TERMINAL_DUPLICATE_ROOT: resolve(FIXTURE_DIR, "terminal-duplicate-root.json"),
  ROOT: resolve(FIXTURE_DIR, "root.json"),
  CHILD: resolve(FIXTURE_DIR, "child.json"),
  ORPHAN: resolve(FIXTURE_DIR, "orphan.json"),
  MISSING_CLASS: resolve(FIXTURE_DIR, "missing-class.json"),
  MISSING_MESSAGE: resolve(FIXTURE_DIR, "missing-message.json"),
  UNKNOWN_UNIT: resolve(FIXTURE_DIR, "unknown-unit.json"),
  EMPTY_EVIDENCE: resolve(FIXTURE_DIR, "empty-evidence.json"),
} as const;

/** Read a complete inert payload; the caller owns all expectations about it. */
export async function readVerificationFixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function withVerificationFixtureRun<T>(
  callback: (env: {
    appendScope(path: string): ReturnType<typeof verifyAppendScopeCommand>;
    appendFinding(path: string): ReturnType<typeof verifyAppendFindingCommand>;
    finish(
      options: Omit<VerifyFinishCliOptions, keyof VerifyInputCliOptions>,
    ): ReturnType<typeof verifyFinishCommand>;
    events(): Promise<readonly JournalEvent[]>;
  }) => Promise<T>,
  verificationType: VerifyVerificationType = VERIFY_VERIFICATION_TYPE.AUDIT,
): Promise<T> {
  return withTempDir("audit-append-", async (productDir) => {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      "Initialize audit fixture",
    ]);
    const root = await readVerificationFixture<AuditScopeUnit>(AUDIT_FIXTURE.ROOT);
    const scenario = {
      ...withFileScope(
        withVerificationType(createVerifyRunContextScenario(), verificationType),
        root.subject,
      ),
      productDir,
    };
    const deps: VerifyCliDeps = {
      cwd: productDir,
      git: {
        execa: async (command, args, options) => {
          const result = await execa(command, [...args], {
            cwd: options?.cwd ?? productDir,
            env: buildGitTestEnvironment(),
            extendEnv: false,
            reject: false,
          });
          return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
        },
      },
      processEnv: {},
      fs: defaultStateStoreFileSystem,
      readInputSource: async () => scenario.inputContent,
      readPayloadSource: (path) => readFile(path, "utf8"),
      journalBinding: { localSink: createRecordingStreamSink().sink },
    };
    const run = await startedRunToken(scenario, deps);
    return callback({
      finish: (options) =>
        verifyFinishCommand({
          verificationType: scenario.verificationType,
          scopeType: scenario.scopeType,
          scope: scenario.scope,
          run,
          ...options,
        }, deps),
      appendScope: (payload) =>
        verifyAppendScopeCommand(verifyAppendOptions(scenario, { run, payload, idempotencyKey: randomUUID() }), deps),
      appendFinding: (payload) =>
        verifyAppendFindingCommand(verifyAppendOptions(scenario, { run, payload, idempotencyKey: randomUUID() }), deps),
      events: async () => {
        const result = await journalReadCommand(
          { type: scenario.verificationType, runToken: run },
          String(JOURNAL_SEQ_BASE),
          deps,
        );
        if (result.exitCode !== 0) throw new Error(result.output);
        return JSON.parse(result.output) as readonly JournalEvent[];
      },
    });
  });
}
