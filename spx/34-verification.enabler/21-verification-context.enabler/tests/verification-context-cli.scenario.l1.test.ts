import { join, win32 } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFICATION_CONTEXT_CLI_ERROR,
  VERIFICATION_CONTEXT_CLI_EXIT_CODE,
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  type VerificationContextCliDeps,
  verificationContextCreateCommand,
} from "@/commands/verification-context/cli";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import {
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_DIR_BASENAME,
  GIT_HEAD_SHA_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type ExecResult,
  type GitDependencies,
} from "@/git/root";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  sampleVerificationContextTestValue,
  VERIFICATION_CONTEXT_TEST_GENERATOR,
} from "@testing/generators/verification-context";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withGitEnv } from "@testing/harnesses/with-git-env";

const GIT_COMMAND_STDERR = "";
const UNEXPECTED_GIT_COMMAND_EXIT_CODE = 1;
const UNEXPECTED_GIT_COMMAND_STDOUT = "";
const UNEXPECTED_GIT_COMMAND_STDERR = "unexpected git command";

function gitSuccess(stdout: string): ExecResult {
  return { exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK, stdout, stderr: GIT_COMMAND_STDERR };
}

function gitFailure(): ExecResult {
  return {
    exitCode: UNEXPECTED_GIT_COMMAND_EXIT_CODE,
    stdout: UNEXPECTED_GIT_COMMAND_STDOUT,
    stderr: UNEXPECTED_GIT_COMMAND_STDERR,
  };
}

function gitDepsForLinkedWorktree(
  storageProductDir: string,
  worktreeRoot: string,
  branchIdentity: string,
  headSha: string,
): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (args.join(" ") === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) return gitSuccess(worktreeRoot);
      if (args.join(" ") === GIT_COMMON_DIR_ARGS.join(" ")) {
        return gitSuccess(join(storageProductDir, GIT_DIR_BASENAME));
      }
      if (args.join(" ") === GIT_CURRENT_BRANCH_ARGS.join(" ")) return gitSuccess(branchIdentity);
      if (args.join(" ") === GIT_HEAD_SHA_ARGS.join(" ")) return gitSuccess(headSha);
      return gitFailure();
    },
  };
}

describe("verification-context CLI", () => {
  it("creates a persisted context for a file subject", async () => {
    const path = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      const created = await verificationContextCreateCommand({
        subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path,
        predicate,
        workflow,
      }, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = JSON.parse(created.output) as { readonly digest: string; readonly contextPath: string };
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly path: string };
          readonly predicate: string;
          readonly workflow: { readonly name: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE, path });
      expect(document.context.predicate).toBe(predicate);
      expect(document.context.workflow.name).toBe(workflow);
    });
  });

  it("records the invoking worktree root while persisting through the common state root", async () => {
    const path = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const storageProductDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const worktreeRoot = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.linkedWorktreeRoot(storageProductDir));
    const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity());
    const headSha = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha());
    const fs = createInMemoryStateStoreFileSystem();

    const created = await verificationContextCreateCommand({
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
      path,
      predicate,
      workflow,
    }, {
      cwd: worktreeRoot,
      fs,
      git: gitDepsForLinkedWorktree(storageProductDir, worktreeRoot, branchIdentity, headSha),
      now: () => createdAt,
      processEnv: {},
    });

    expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
    const result = JSON.parse(created.output) as { readonly contextPath: string };
    const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
      readonly context: {
        readonly launch: { readonly productDir: string; readonly headSha: string };
      };
    };
    expect(result.contextPath.startsWith(storageProductDir)).toBe(true);
    expect(result.contextPath.startsWith(worktreeRoot)).toBe(false);
    expect(document.context.launch.productDir).toBe(worktreeRoot);
    expect(document.context.launch.headSha).toBe(headSha);
  });

  it("creates a persisted context for a changeset subject", async () => {
    const base = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef());
    const head = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      const created = await verificationContextCreateCommand({
        subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base,
        head,
        predicate,
        workflow,
      }, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = JSON.parse(created.output) as { readonly digest: string; readonly contextPath: string };
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly base: string; readonly head: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET, base, head });
    });
  });

  it("rejects an absolute or parent-escaping file subject path before persistence", async () => {
    const path = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      for (
        const unsafePath of [
          productDir,
          win32.resolve(productDir, path),
          join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY_SEGMENT, path),
          win32.join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY_SEGMENT, path),
        ]
      ) {
        const created = await verificationContextCreateCommand({
          subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
          path: unsafePath,
          predicate,
          workflow,
        }, deps);

        expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
        expect(created.output).toBe(VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_UNSAFE);
      }
    });
  });
});
