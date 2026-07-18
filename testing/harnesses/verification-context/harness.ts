import { join } from "node:path";

import {
  VERIFICATION_CONTEXT_CLI_ENV,
  VERIFICATION_CONTEXT_CLI_EXIT_CODE,
  type VerificationContextCliDeps,
  verificationContextCreateCommand,
} from "@/commands/verification-context/cli";
import {
  createVerificationContextDocument,
  type VerificationContextDocument,
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
import { STATE_STORE_TEXT_ENCODING, type StateStoreFileSystem } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  createDivergentVerificationContextContent,
  createRuntimeContaminatedVerificationContextFileScenario,
  createVerificationContextChangesetScenario,
  createVerificationContextFileScenario,
  createWindowsVerificationContextFileScenario,
  unsafeVerificationContextFileSubjectPaths,
  type VerificationContextCliScenario,
  type VerificationContextFileScenario,
} from "@testing/generators/verification-context";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withGitEnv } from "@testing/harnesses/with-git-env";

interface PersistedVerificationContextOutput {
  readonly digest: string;
  readonly contextPath: string;
  readonly created: boolean;
}

interface PersistedScenarioResult<TScenario extends VerificationContextCliScenario> {
  readonly scenario: TScenario;
  readonly command: Awaited<ReturnType<typeof verificationContextCreateCommand>>;
  readonly result: PersistedVerificationContextOutput;
  readonly document: VerificationContextDocument;
  readonly persistedBytes: string;
  readonly canonicalJson: string;
}

class RecordingStateStoreFileSystem implements StateStoreFileSystem {
  mutationCount = 0;

  constructor(private readonly delegate: StateStoreFileSystem) {}

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.mkdir(path, options);
  }

  async writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.writeFile(path, data, options);
  }

  async appendFile(path: string, data: string): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.appendFile(path, data);
  }

  readFile(path: string, encoding: "utf8"): Promise<string> {
    return this.delegate.readFile(path, encoding);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.link(existingPath, newPath);
  }

  async rename(from: string, to: string): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.rename(from, to);
  }

  async rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void> {
    this.mutationCount += 1;
    await this.delegate.rm(path, options);
  }

  lstat(path: string): ReturnType<StateStoreFileSystem["lstat"]> {
    return this.delegate.lstat(path);
  }

  readdir(path: string, options: { readonly withFileTypes: true }): ReturnType<StateStoreFileSystem["readdir"]> {
    return this.delegate.readdir(path, options);
  }
}

function parsePersistedOutput(output: string): PersistedVerificationContextOutput {
  return JSON.parse(output) as PersistedVerificationContextOutput;
}

function parseDocument(content: string): VerificationContextDocument {
  return JSON.parse(content) as VerificationContextDocument;
}

function canonicalJsonFor(document: VerificationContextDocument): string {
  const canonical = createVerificationContextDocument(document.context);
  if (!canonical.ok) throw new Error(canonical.error);
  return canonical.value.canonicalJson;
}

function gitSuccess(stdout: string): ExecResult {
  return { exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK, stdout, stderr: "" };
}

function gitFailure(): ExecResult {
  return { exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR, stdout: "", stderr: "unexpected git command" };
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

async function persistedScenarioResult<TScenario extends VerificationContextCliScenario>(
  scenario: TScenario,
  command: Awaited<ReturnType<typeof verificationContextCreateCommand>>,
  fs: StateStoreFileSystem,
): Promise<PersistedScenarioResult<TScenario>> {
  const result = parsePersistedOutput(command.output);
  const persistedBytes = await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING);
  const document = parseDocument(persistedBytes);
  return {
    scenario,
    command,
    result,
    document,
    persistedBytes,
    canonicalJson: canonicalJsonFor(document),
  };
}

async function runPersistedScenario<TScenario extends VerificationContextCliScenario>(
  scenario: TScenario,
  processEnv: NodeJS.ProcessEnv = {},
): Promise<PersistedScenarioResult<TScenario>> {
  return await withGitEnv(async ({ path: productDir }) => {
    const fs = createInMemoryStateStoreFileSystem();
    return await persistedScenarioResult(
      scenario,
      await verificationContextCreateCommand(scenario.request, {
        cwd: productDir,
        fs,
        now: () => scenario.createdAt,
        processEnv,
      }),
      fs,
    );
  });
}

export function runFileVerificationContextScenario(): Promise<
  PersistedScenarioResult<VerificationContextFileScenario>
> {
  return runPersistedScenario(createVerificationContextFileScenario());
}

export function runChangesetVerificationContextScenario(): ReturnType<typeof runPersistedScenario> {
  return runPersistedScenario(createVerificationContextChangesetScenario());
}

export function runWindowsVerificationContextFileScenario(): Promise<
  PersistedScenarioResult<VerificationContextFileScenario>
> {
  return runPersistedScenario(createWindowsVerificationContextFileScenario());
}

export function runRuntimeContaminatedVerificationContextFileScenario(): Promise<
  PersistedScenarioResult<VerificationContextFileScenario>
> {
  return runPersistedScenario(createRuntimeContaminatedVerificationContextFileScenario());
}

export async function runIdenticalVerificationContextPersistenceScenario(): Promise<{
  readonly first: PersistedVerificationContextOutput;
  readonly second: PersistedVerificationContextOutput;
  readonly firstCommand: Awaited<ReturnType<typeof verificationContextCreateCommand>>;
  readonly secondCommand: Awaited<ReturnType<typeof verificationContextCreateCommand>>;
}> {
  return await withGitEnv(async ({ path: productDir }) => {
    const scenario = createVerificationContextFileScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps: VerificationContextCliDeps = {
      cwd: productDir,
      fs,
      now: () => scenario.createdAt,
      processEnv: {},
    };
    const firstCommand = await verificationContextCreateCommand(scenario.request, deps);
    const secondCommand = await verificationContextCreateCommand(scenario.request, deps);
    return {
      first: parsePersistedOutput(firstCommand.output),
      second: parsePersistedOutput(secondCommand.output),
      firstCommand,
      secondCommand,
    };
  });
}

export async function runMismatchedVerificationContextPersistenceScenario(): Promise<{
  readonly command: Awaited<ReturnType<typeof verificationContextCreateCommand>>;
}> {
  return await withGitEnv(async ({ path: productDir }) => {
    const scenario = createVerificationContextFileScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps: VerificationContextCliDeps = {
      cwd: productDir,
      fs,
      now: () => scenario.createdAt,
      processEnv: {},
    };
    const first = await verificationContextCreateCommand(scenario.request, deps);
    await fs.writeFile(
      parsePersistedOutput(first.output).contextPath,
      createDivergentVerificationContextContent(),
    );
    return { command: await verificationContextCreateCommand(scenario.request, deps) };
  });
}

export async function runLinkedWorktreeVerificationContextScenario(): Promise<
  PersistedScenarioResult<VerificationContextFileScenario> & {
    readonly storageProductDir: string;
    readonly worktreeRoot: string;
    readonly branchIdentity: string;
    readonly headSha: string;
  }
> {
  const scenario = createVerificationContextFileScenario();
  const storageProductDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
  const worktreeRoot = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.linkedWorktreeRoot(storageProductDir));
  const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity());
  const headSha = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha());
  const fs = createInMemoryStateStoreFileSystem();
  return {
    ...await persistedScenarioResult(
      scenario,
      await verificationContextCreateCommand(scenario.request, {
        cwd: worktreeRoot,
        fs,
        git: gitDepsForLinkedWorktree(storageProductDir, worktreeRoot, branchIdentity, headSha),
        now: () => scenario.createdAt,
        processEnv: {},
      }),
      fs,
    ),
    storageProductDir,
    worktreeRoot,
    branchIdentity,
    headSha,
  };
}

export async function runBranchOverrideVerificationContextScenario(): Promise<
  PersistedScenarioResult<VerificationContextFileScenario> & { readonly branchIdentity: string }
> {
  const scenario = createVerificationContextFileScenario();
  const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity());
  return {
    ...await runPersistedScenario(scenario, { [VERIFICATION_CONTEXT_CLI_ENV.BRANCH]: branchIdentity }),
    branchIdentity,
  };
}

export async function runUnsafeVerificationContextFileScenarios(): Promise<{
  readonly commands: readonly Awaited<ReturnType<typeof verificationContextCreateCommand>>[];
  readonly persistenceMutationCount: number;
}> {
  return await withGitEnv(async ({ path: productDir }) => {
    const scenario = createVerificationContextFileScenario();
    const fs = new RecordingStateStoreFileSystem(createInMemoryStateStoreFileSystem());
    const commands = [];
    for (const path of unsafeVerificationContextFileSubjectPaths(productDir, scenario.request.path)) {
      commands.push(
        await verificationContextCreateCommand({ ...scenario.request, path }, {
          cwd: productDir,
          fs,
          now: () => scenario.createdAt,
          processEnv: {},
        }),
      );
    }
    return { commands, persistenceMutationCount: fs.mutationCount };
  });
}
