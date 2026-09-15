import { Command, CommanderError, Option } from "commander";
import { spawnSync } from "node:child_process";
import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { createChangeDomain } from "@/interfaces/cli/change";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { createChangeDraftStore } from "@/lib/change-drafts";
import {
  CHANGE_DRAFT,
  type ChangeDraftDependencies,
  changeDraftDependencies,
  type ChangeDraftDescriptor,
  type ChangeDraftStore,
} from "@/lib/change-drafts/contract";
import { withoutGitEnvironment } from "@/lib/git/environment";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";
import { STATE_STORE_SCOPE_PATH, worktreeScopeDir } from "@/lib/state-store";
import { PROPERTY_LEVEL, PROPERTY_TIMEOUTS_MS } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DRAFT_TEMP_PREFIX = "spx-change-draft-";
const TEMP_GIT_ENV = {
  ...withoutGitEnvironment(process.env),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Draft fixture",
  GIT_AUTHOR_EMAIL: "draft@example.invalid",
  GIT_COMMITTER_NAME: "Draft fixture",
  GIT_COMMITTER_EMAIL: "draft@example.invalid",
};

/** Independent Commander grammar: no product registry, handlers, or error formatter is invoked. */
export function referenceDraftDiagnostic(args: readonly string[]): string {
  let stderr = "";
  const program = new Command().exitOverride().configureOutput({
    writeErr: (text) => {
      stderr += text;
    },
  });
  const draft = program.command(CHANGE_COMMAND.name).command(CHANGE_COMMAND.draft);
  draft.command(CHANGE_COMMAND.operations.create)
    .addOption(
      new Option(`${CHANGE_COMMAND.inputOption} <source>`).choices([CHANGE_COMMAND.stdin]).makeOptionMandatory(),
    );
  draft.command(CHANGE_COMMAND.operations.delete).argument(CHANGE_COMMAND.idOperand);
  draft.command(CHANGE_COMMAND.operations.list);
  try {
    program.parse([...args], { from: "user" });
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
  }
  return escapeCliArgument(stderr.trim());
}

export interface DraftCliObservation {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ChangeDraftEnv {
  readonly productDir: string;
  readonly draftDir: string;
  readonly store: ChangeDraftStore;
  readonly dependencies: ChangeDraftDependencies;
  read(draft: ChangeDraftDescriptor): Promise<string>;
  inspect(path: string): Promise<Stats>;
  readPath(path: string): Promise<string>;
  retainedNames(): Promise<string[]>;
  listPath(path: string): Promise<string[]>;
  setDraftDirectoryMode(mode: number): Promise<void>;
  makeVisibleToGit(): Promise<void>;
  obstructStorage(text: string): Promise<string>;
  addUnmanagedFile(name: string, text: string): Promise<string>;
  sibling(): Promise<{ productDir: string; store: ChangeDraftStore }>;
  symlinkStorage(): Promise<string>;
  symlinkDraft(draftId: string, text: string): Promise<{ path: string; target: string }>;
  runCli(args: readonly string[], input?: string, cwd?: string): Promise<DraftCliObservation>;
  runPackagedCli(args: readonly string[], input?: string): DraftCliObservation;
}

function git(productDir: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], { cwd: productDir, env: TEMP_GIT_ENV, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Temporary repository command failed: ${result.stderr}`, { cause: result.error });
  }
}

function captureCommandExits(command: Command): void {
  command.exitOverride();
  for (const child of command.commands) captureCommandExits(child);
}

export async function withChangeDraftEnv<T>(callback: (env: ChangeDraftEnv) => Promise<T>): Promise<T> {
  return withTempDir(DRAFT_TEMP_PREFIX, async (root) => {
    const productDir = await fs.realpath(root);
    git(productDir, ["init", "--quiet"]);
    const ignorePath = join(productDir, ".gitignore");
    await fs.writeFile(ignorePath, `${STATE_STORE_SCOPE_PATH.SPX_DIR}/\n`);
    const draftDir = join(worktreeScopeDir(productDir), CHANGE_DRAFT.directory);
    const store = await createChangeDraftStore({ cwd: productDir });
    const env: ChangeDraftEnv = {
      productDir,
      draftDir,
      store,
      dependencies: changeDraftDependencies,
      read: (draft) => fs.readFile(draft.path, "utf8"),
      inspect: (path) => fs.lstat(path),
      readPath: (path) => fs.readFile(path, "utf8"),
      retainedNames: () => fs.readdir(draftDir),
      listPath: (path) => fs.readdir(path),
      setDraftDirectoryMode: async (mode) => {
        await fs.mkdir(draftDir, { recursive: true, mode: CHANGE_DRAFT.directoryMode });
        await fs.chmod(draftDir, mode);
      },
      makeVisibleToGit: () =>
        fs.writeFile(
          ignorePath,
          `!${STATE_STORE_SCOPE_PATH.SPX_DIR}/\n!${STATE_STORE_SCOPE_PATH.SPX_DIR}/**\n`,
        ),
      obstructStorage: async (text) => {
        const path = join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR);
        await fs.writeFile(path, text);
        return path;
      },
      addUnmanagedFile: async (name, text) => {
        const path = join(draftDir, `notes-${name}${CHANGE_DRAFT.extension}`);
        await fs.writeFile(path, text);
        return path;
      },
      sibling: async () => {
        git(productDir, ["add", ".gitignore"]);
        git(productDir, ["commit", "--quiet", "-m", "Create fixture"]);
        const siblingDir = join(productDir, "sibling");
        git(productDir, ["worktree", "add", "--quiet", "--detach", siblingDir]);
        return { productDir: siblingDir, store: await createChangeDraftStore({ cwd: siblingDir }) };
      },
      symlinkStorage: async () => {
        const target = join(productDir, "outside");
        await fs.mkdir(target);
        await fs.symlink(target, join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR));
        return target;
      },
      symlinkDraft: async (draftId, text) => {
        const target = join(productDir, "outside.md");
        const path = join(draftDir, `${draftId}${CHANGE_DRAFT.extension}`);
        await fs.mkdir(draftDir, { recursive: true, mode: CHANGE_DRAFT.directoryMode });
        await fs.writeFile(target, text);
        await fs.symlink(target, path);
        return { path, target };
      },
      runCli: async (args, input, cwd = productDir) => {
        let status = 0;
        let stdout = "";
        let stderr = "";
        const program = createCliProgram({
          domains: [createChangeDomain(Readable.from([input ?? ""]))],
          processCwd: () => cwd,
          writeStdout: (text) => {
            stdout += text;
          },
          writeStderr: (text) => {
            stderr += text;
          },
          setExitCode: (code) => {
            status = code;
          },
        });
        captureCommandExits(program);
        try {
          await program.parseAsync([...args], { from: SPX_COMMANDER_PARSE_SOURCE });
        } catch (error) {
          if (!(error instanceof CommanderError)) throw error;
          status = error.exitCode;
        }
        return { status, stdout, stderr };
      },
      runPackagedCli: (args, input) => {
        const result = spawnSync(process.execPath, [
          fileURLToPath(new URL("../../bin/spx.js", import.meta.url)),
          ...args,
        ], {
          cwd: productDir,
          env: TEMP_GIT_ENV,
          input,
          encoding: "utf8",
          timeout: PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L1],
        });
        if (result.error) {
          throw new Error(`Packaged draft command could not complete: ${result.stderr}`, { cause: result.error });
        }
        return { status: result.status, stdout: result.stdout, stderr: result.stderr };
      },
    };
    return callback(env);
  });
}

export function collidingDraftDependencies(env: ChangeDraftEnv, draftId: string): ChangeDraftDependencies {
  return { ...env.dependencies, generateId: () => draftId };
}

// Failure simulation: retain real exclusive-open and cleanup, fail after a partial write.
export function failingDraftWriteDependencies(env: ChangeDraftEnv): ChangeDraftDependencies {
  return {
    ...env.dependencies,
    fs: {
      ...env.dependencies.fs,
      openExclusive: async (path, mode) => {
        const file = await env.dependencies.fs.openExclusive(path, mode);
        return {
          write: async (text) => {
            await file.write(text.slice(0, Math.floor(text.length / 2)));
            throw new Error(`Injected write failure at ${path}`);
          },
          close: () => file.close(),
        };
      },
    },
  };
}

export function draftParentDirectory(draft: ChangeDraftDescriptor): string {
  return dirname(draft.path);
}
