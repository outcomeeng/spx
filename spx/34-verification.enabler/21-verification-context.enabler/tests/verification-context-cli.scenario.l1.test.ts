import { join, win32 } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFICATION_CONTEXT_CLI_ENV,
  VERIFICATION_CONTEXT_CLI_ERROR,
  VERIFICATION_CONTEXT_CLI_EXIT_CODE,
  type VerificationContextCliDeps,
  verificationContextCreateCommand,
} from "@/commands/verification-context/cli";
import { VERIFICATION_CONTEXT_RUNTIME_ERROR } from "@/commands/verification-context/runtime";
import {
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
} from "@/domains/verification-context/context";
import {
  type ExecResult,
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_DIR_BASENAME,
  GIT_HEAD_SHA_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type GitDependencies,
} from "@/lib/git/root";
import { slugBranchIdentity, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  sampleVerificationContextTestValue,
  VERIFICATION_CONTEXT_TEST_GENERATOR,
} from "@testing/generators/verification-context";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withGitEnv } from "@testing/harnesses/with-git-env";

interface VerificationContextCliGitResultValues {
  readonly successStderr: string;
  readonly unexpectedCommand: {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  };
}

const verificationContextCliGitResult: VerificationContextCliGitResultValues = {
  successStderr: "",
  unexpectedCommand: {
    exitCode: 1,
    stdout: "",
    stderr: "unexpected git command",
  },
};

interface VerificationContextFileScenario {
  readonly request: {
    readonly subject: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.FILE;
    readonly path: string;
    readonly predicate: string;
    readonly workflow: string;
  };
  readonly createdAt: Date;
}

interface VerificationContextChangesetScenario {
  readonly request: {
    readonly subject: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET;
    readonly base: string;
    readonly head: string;
    readonly predicate: string;
    readonly workflow: string;
  };
  readonly createdAt: Date;
}

interface PersistedVerificationContextOutput {
  readonly digest: string;
  readonly contextPath: string;
  readonly created: boolean;
}

function createFileScenario(): VerificationContextFileScenario {
  return {
    request: {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
      path: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath()),
      predicate: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate()),
      workflow: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow()),
    },
    createdAt: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt()),
  };
}

function createChangesetScenario(): VerificationContextChangesetScenario {
  return {
    request: {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      base: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef()),
      head: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef()),
      predicate: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate()),
      workflow: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow()),
    },
    createdAt: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt()),
  };
}

function createWindowsFileScenario(): VerificationContextFileScenario {
  const scenario = createFileScenario();
  return {
    ...scenario,
    request: {
      ...scenario.request,
      path: scenario.request.path.replaceAll(
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
      ),
    },
  };
}

function gitSuccess(stdout: string): ExecResult {
  return {
    exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK,
    stdout,
    stderr: verificationContextCliGitResult.successStderr,
  };
}

function gitFailure(): ExecResult {
  return {
    exitCode: verificationContextCliGitResult.unexpectedCommand.exitCode,
    stdout: verificationContextCliGitResult.unexpectedCommand.stdout,
    stderr: verificationContextCliGitResult.unexpectedCommand.stderr,
  };
}

function unsafeFileSubjectPaths(productDir: string, path: string): readonly string[] {
  const driveRelativeParentPath = `C:${VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.PREFIX}${path}`;
  const parentSegments = Array.from(
    { length: path.split(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL).length + 1 },
    () => VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT,
  );
  const normalizedParentEscapePath = join(
    path,
    ...parentSegments,
    path,
  );
  return [
    productDir,
    win32.resolve(productDir, path),
    VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT,
    join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT, path),
    win32.join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT, path),
    driveRelativeParentPath,
    normalizedParentEscapePath,
  ];
}

function parsePersistedOutput(output: string): PersistedVerificationContextOutput {
  return JSON.parse(output) as PersistedVerificationContextOutput;
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
    const scenario = createFileScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      const created = await verificationContextCreateCommand(scenario.request, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = parsePersistedOutput(created.output);
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly path: string };
          readonly predicate: string;
          readonly workflow: { readonly name: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path: scenario.request.path,
      });
      expect(document.context.predicate).toBe(scenario.request.predicate);
      expect(document.context.workflow.name).toBe(scenario.request.workflow);
    });
  });

  it("reports the same context when persistence already contains identical content", async () => {
    const scenario = createFileScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      const firstCreated = await verificationContextCreateCommand(scenario.request, deps);
      const secondCreated = await verificationContextCreateCommand(scenario.request, deps);

      expect(firstCreated.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      expect(secondCreated.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const firstResult = parsePersistedOutput(firstCreated.output);
      const secondResult = parsePersistedOutput(secondCreated.output);
      expect(secondResult.digest).toBe(firstResult.digest);
      expect(secondResult.contextPath).toBe(firstResult.contextPath);
      expect(firstResult.created).toBe(true);
      expect(secondResult.created).toBe(false);
    });
  });

  it("rejects persistence when an existing context path contains different content", async () => {
    const scenario = createFileScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      const firstCreated = await verificationContextCreateCommand(scenario.request, deps);
      expect(firstCreated.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = parsePersistedOutput(firstCreated.output);

      await fs.writeFile(result.contextPath, VERIFICATION_CONTEXT_RUNTIME_ERROR.CONTENT_MISMATCH);
      const secondCreated = await verificationContextCreateCommand(scenario.request, deps);

      expect(secondCreated.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
      expect(secondCreated.output).toBe(VERIFICATION_CONTEXT_RUNTIME_ERROR.CONTENT_MISMATCH);
    });
  });

  it("records the invoking worktree root while persisting through the common state root", async () => {
    const scenario = createFileScenario();
    const storageProductDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const worktreeRoot = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.linkedWorktreeRoot(storageProductDir));
    const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity());
    const headSha = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha());
    const fs = createInMemoryStateStoreFileSystem();

    const created = await verificationContextCreateCommand(scenario.request, {
      cwd: worktreeRoot,
      fs,
      git: gitDepsForLinkedWorktree(storageProductDir, worktreeRoot, branchIdentity, headSha),
      now: () => scenario.createdAt,
      processEnv: {},
    });

    expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
    const result = parsePersistedOutput(created.output);
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
    const scenario = createChangesetScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      const created = await verificationContextCreateCommand(scenario.request, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = parsePersistedOutput(created.output);
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly base: string; readonly head: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base: scenario.request.base,
        head: scenario.request.head,
      });
    });
  });

  it("uses the verification branch environment override for the context scope", async () => {
    const scenario = createFileScenario();
    const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity());
    const branchSlug = slugBranchIdentity(branchIdentity);
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: { [VERIFICATION_CONTEXT_CLI_ENV.BRANCH]: branchIdentity },
      };

      const created = await verificationContextCreateCommand(scenario.request, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = parsePersistedOutput(created.output);
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly context: {
          readonly launch: { readonly branchSlug: string; readonly branchIdentity: string };
        };
      };
      expect(result.contextPath).toContain(branchSlug);
      expect(document.context.launch.branchSlug).toBe(branchSlug);
      expect(document.context.launch.branchIdentity).toBe(branchIdentity);
    });
  });

  it("canonicalizes Windows file separators before persistence", async () => {
    const scenario = createWindowsFileScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      const created = await verificationContextCreateCommand(scenario.request, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = parsePersistedOutput(created.output);
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly context: {
          readonly subject: { readonly path: string };
        };
      };
      expect(document.context.subject.path).toBe(
        scenario.request.path.replaceAll(
          VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
          VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        ),
      );
    });
  });

  it("rejects an absolute or parent-escaping file subject path before persistence", async () => {
    const scenario = createFileScenario();
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv: {},
      };

      for (const unsafePath of unsafeFileSubjectPaths(productDir, scenario.request.path)) {
        const created = await verificationContextCreateCommand({
          ...scenario.request,
          path: unsafePath,
        }, deps);

        expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
        expect(created.output).toBe(VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_UNSAFE);
      }
    });
  });
});
