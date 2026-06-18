import { appendFile, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { auditInitCommand } from "@/commands/audit/lifecycle";
import {
  type AuditRunStateFileSystem,
  appendAuditRunEvent,
  createAuditRunFile,
  readAuditRunEvents,
  writeTerminalAuditRunState,
} from "@/commands/audit/run-state";
import {
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_EVENT,
  AUDIT_PROGRESS_STEP,
  auditRunProgressEventInput,
  auditRunStartedEventInput,
  auditRunFileName,
  formatAuditRunTimestamp,
} from "@/domains/audit/run-state";
import { appendableJournalSealMarkerPath } from "@/lib/appendable-journal-store";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  ERROR_CODE_TOO_MANY_SYMBOLIC_LINKS,
  STATE_STORE_PATH,
  STATE_STORE_TEXT_ENCODING,
} from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { auditBranchRunsDir, writeAuditConfig } from "@testing/harnesses/audit/harness";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";

function bufferFromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function createFailingMkdirFileSystem(errorMessage: string): AuditRunStateFileSystem {
  return {
    mkdir: async () => {
      throw new Error(errorMessage);
    },
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: async () => emptyJson,
    readdir: async () => [],
    lstat: async () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }),
    rm: () => Promise.resolve(),
  };
}

async function withTempProductDir(callback: (productDir: string) => Promise<void>): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  try {
    await callback(productDir);
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

const emptyJson = "{}";
const emptyText = "";

describe("audit run-file storage", () => {
  it("creates branch-scoped run files under the state-store audit root", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.runsDir).toBe(auditBranchRunsDir(productDir, branchSlug));
      expect(result.value.runToken).toBe(`${formatAuditRunTimestamp(startedDate)}-${runId}`);
      expect(result.value.runFileName).toBe(auditRunFileName(result.value.runToken));
      expect(result.value.runFilePath).toBe(join(result.value.runsDir, result.value.runFileName));
      await expect(readFile(result.value.runFilePath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(emptyText);
    });
  });

  it("stores init-created run files under the Git common-dir product root from a linked worktree", async () => {
    const linkedBranch = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const auditBranch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
    const baseRef = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const auditor = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const target = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const linkedDirectoryName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const initialCommitMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const headSha = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.headSha());

    await withTempProductDir(async (productDir) => {
      const linkedParentDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
      const linkedProductDir = join(linkedParentDir, linkedDirectoryName);
      try {
        await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.CONFIG,
          GIT_TEST_CONFIG.EMAIL_KEY,
          GIT_TEST_CONFIG.EMAIL,
        ]);
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.CONFIG,
          GIT_TEST_CONFIG.USER_NAME_KEY,
          GIT_TEST_CONFIG.USER_NAME,
        ]);
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.COMMIT,
          GIT_TEST_FLAGS.ALLOW_EMPTY,
          GIT_TEST_FLAGS.COMMIT_MESSAGE,
          initialCommitMessage,
        ]);
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          linkedBranch,
          linkedProductDir,
        ]);
        await writeAuditConfig(linkedProductDir, {
          baseRef,
          auditors: [auditor],
          include: [target],
        });

        const init = await auditInitCommand({
          branch: auditBranch,
          headSha,
          json: true,
        }, {
          cwd: linkedProductDir,
        });

        expect(init.exitCode).toBe(0);
        const initPayload = JSON.parse(init.output) as {
          readonly branchSlug: string;
          readonly runFilePath: string;
        };
        expect(initPayload.runFilePath).toContain(auditBranchRunsDir(productDir, initPayload.branchSlug));
        expect(initPayload.runFilePath).not.toContain(auditBranchRunsDir(linkedProductDir, initPayload.branchSlug));
        await expect(readFile(initPayload.runFilePath, STATE_STORE_TEXT_ENCODING)).resolves.toContain(
          AUDIT_RUN_EVENT.STARTED_TYPE,
        );
        await expect(readFile(join(linkedProductDir, STATE_STORE_PATH.SPX_DIR), STATE_STORE_TEXT_ENCODING)).rejects
          .toMatchObject({ code: ERROR_CODE_NOT_FOUND });
      } finally {
        await rm(linkedParentDir, { recursive: true, force: true });
      }
    });
  });

  it("retries EEXIST run-id collisions with a fresh run id", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const firstRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const secondRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const firstReservation = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(firstRunId),
      });
      expect(firstReservation.ok).toBe(true);
      const runIds = [firstRunId, secondRunId];

      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runIds.shift() ?? secondRunId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.runId).toBe(secondRunId);
    });
  });

  it("fails before auditor execution when collision retries are exhausted", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const firstReservation = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
      });
      expect(firstReservation.ok).toBe(true);

      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
        maxAttempts: 1,
      });

      expect(result).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.RUN_FILE_COLLISION_LIMIT });
    });
  });

  it("returns a typed error when the root run-file directory cannot be created", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const errorMessage = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, branchSlug, {
        fs: createFailingMkdirFileSystem(errorMessage),
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(result.value.runFilePath);
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED);
      expect(result.error).toContain(errorMessage);
    });
  });

  it("rejects unnormalized branch slugs before constructing storage paths", async () => {
    const invalidBranchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, invalidBranchSlug);

      expect(result.ok).toBe(false);
    });
  });

  it("writes terminal state into the reserved JSONL run file", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const started = await appendAuditRunEvent(
        productDir,
        runFile.value.runFilePath,
        auditRunStartedEventInput(state, {
          id: runFile.value.runFileName,
          time: state.startedAt,
          attempt: 1,
        }),
      );
      expect(started.ok).toBe(true);

      const result = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value).toBe(runFile.value.runFilePath);
      const events = await readAuditRunEvents(productDir, result.value);
      expect(events.ok).toBe(true);
      if (!events.ok) throw new Error(events.error);
      expect(events.value.map((event) => event.type)).toEqual([
        AUDIT_RUN_EVENT.STARTED_TYPE,
        AUDIT_RUN_EVENT.COMPLETED_TYPE,
      ]);
      expect(events.value[1]?.data).toMatchObject({ status: state.status });
      await expect(readFile(appendableJournalSealMarkerPath(result.value), STATE_STORE_TEXT_ENCODING)).resolves.toBe(
        emptyText,
      );
    });
  });

  it("rejects appending audit events after terminal seal without changing the journal", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const started = await appendAuditRunEvent(
        productDir,
        runFile.value.runFilePath,
        auditRunStartedEventInput(state, {
          id: runFile.value.runFileName,
          time: state.startedAt,
          attempt: 1,
        }),
      );
      expect(started.ok).toBe(true);
      const closed = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);
      expect(closed.ok).toBe(true);
      const beforeAppend = await readAuditRunEvents(productDir, runFile.value.runFilePath);
      expect(beforeAppend.ok).toBe(true);
      if (!beforeAppend.ok) throw new Error(beforeAppend.error);

      const appended = await appendAuditRunEvent(
        productDir,
        runFile.value.runFilePath,
        auditRunProgressEventInput({
          step: AUDIT_PROGRESS_STEP.DONE,
          at: state.completedAt,
        }, {
          id: `${runFile.value.runFileName}:${AUDIT_RUN_EVENT.PROGRESS_TYPE}`,
          time: state.completedAt,
          attempt: 1,
        }),
      );

      expect(appended).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS });
      await expect(readAuditRunEvents(productDir, runFile.value.runFilePath)).resolves.toEqual(beforeAppend);
    });
  });

  it("rejects terminal writes when an unsealed completed event already exists", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const firstWrite = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);
      expect(firstWrite.ok).toBe(true);
      await rm(appendableJournalSealMarkerPath(runFile.value.runFilePath));
      const beforeRetry = await readAuditRunEvents(productDir, runFile.value.runFilePath);
      expect(beforeRetry.ok).toBe(true);
      if (!beforeRetry.ok) throw new Error(beforeRetry.error);

      const retry = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);

      expect(retry).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS });
      await expect(readAuditRunEvents(productDir, runFile.value.runFilePath)).resolves.toEqual(beforeRetry);
    });
  });

  it("rejects direct run-state access outside branch-scoped audit storage", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const outsideRunFilePath = join(productDir, runFile.value.runFileName);

      const append = await appendAuditRunEvent(
        productDir,
        outsideRunFilePath,
        auditRunStartedEventInput(state, {
          id: runFile.value.runFileName,
          time: state.startedAt,
          attempt: 1,
        }),
      );
      const read = await readAuditRunEvents(productDir, outsideRunFilePath);
      const write = await writeTerminalAuditRunState(productDir, outsideRunFilePath, state);

      expect(append).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      expect(read).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      expect(write).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      await expect(readFile(outsideRunFilePath, STATE_STORE_TEXT_ENCODING)).rejects.toMatchObject({
        code: ERROR_CODE_NOT_FOUND,
      });
    });
  });

  it("rejects valid-looking direct run-state paths outside the scoped product root", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const outsideRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const outsideProductDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
      try {
        const runFile = await createAuditRunFile(outsideProductDir, branchSlug, {
          randomBytes: () => bufferFromHex(outsideRunId),
        });
        expect(runFile.ok).toBe(true);
        if (!runFile.ok) throw new Error(runFile.error);

        const append = await appendAuditRunEvent(
          productDir,
          runFile.value.runFilePath,
          auditRunStartedEventInput(state, {
            id: runFile.value.runFileName,
            time: state.startedAt,
            attempt: 1,
          }),
        );
        const read = await readAuditRunEvents(productDir, runFile.value.runFilePath);
        const write = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);

        expect(append).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
        expect(read).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
        expect(write).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
        await expect(readFile(runFile.value.runFilePath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(emptyText);
      } finally {
        await rm(outsideProductDir, { recursive: true, force: true });
      }
    });
  });

  it("rejects run-file reads when a file is swapped to a symlink after validation", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const symlinkTargetName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const symlinkTargetPath = join(productDir, symlinkTargetName);
      await writeFile(symlinkTargetPath, emptyJson);
      await rm(runFile.value.runFilePath);
      await symlink(symlinkTargetPath, runFile.value.runFilePath);

      const raceWindowFileSystem: AuditRunStateFileSystem = {
        ...defaultStateStoreFileSystem,
        lstat: (path) => {
          if (path === runFile.value.runFilePath) {
            return Promise.resolve({
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            });
          }
          return lstat(path);
        },
      };

      const result = await readAuditRunEvents(productDir, runFile.value.runFilePath, {
        fs: raceWindowFileSystem,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a no-follow read error");
      expect(result.error).toContain(ERROR_CODE_TOO_MANY_SYMBOLIC_LINKS);
    });
  });

  it("returns a write error when the seal-marker read fails", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const ioError = Object.assign(new Error(errorCode), { code: errorCode });

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const sealMarkerPath = appendableJournalSealMarkerPath(runFile.value.runFilePath);

      const failingSealReadFileSystem: AuditRunStateFileSystem = {
        mkdir: () => Promise.resolve(),
        writeFile: () => Promise.resolve(),
        appendFile: () => Promise.resolve(),
        readFile: () => Promise.reject(ioError),
        readdir: () => Promise.resolve([]),
        rm: () => Promise.resolve(),
        lstat: (path) => {
          if (path === sealMarkerPath) {
            return Promise.reject(Object.assign(new Error(ERROR_CODE_NOT_FOUND), { code: ERROR_CODE_NOT_FOUND }));
          }
          return Promise.resolve({
            isDirectory: () => path !== runFile.value.runFilePath,
            isFile: () => path === runFile.value.runFilePath,
            isSymbolicLink: () => false,
          });
        },
      };
      const result = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state, {
        fs: failingSealReadFileSystem,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a write error");
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED);
    });
  });

  it("restores the run file when seal creation fails after appending the terminal event", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const sealWriteError = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const originalContent = await readFile(runFile.value.runFilePath, STATE_STORE_TEXT_ENCODING);
      const sealMarkerPath = appendableJournalSealMarkerPath(runFile.value.runFilePath);

      const failingSealWriteFileSystem: AuditRunStateFileSystem = {
        mkdir: () => Promise.resolve(),
        writeFile: (path, data, options) => {
          if (path === sealMarkerPath) throw new Error(sealWriteError);
          return writeFile(path, data, options);
        },
        appendFile: (path, data) => appendFile(path, data),
        readFile: (path, encoding) => readFile(path, encoding),
        readdir: () => Promise.resolve([]),
        lstat: (path) => lstat(path),
        rm: () => Promise.resolve(),
      };

      const result = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state, {
        fs: failingSealWriteFileSystem,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a seal write error");
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED);
      expect(result.error).toContain(sealWriteError);
      await expect(readFile(runFile.value.runFilePath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(originalContent);
      await expect(readAuditRunEvents(productDir, runFile.value.runFilePath)).resolves.toEqual({
        ok: true,
        value: [],
      });
    });
  });
});
