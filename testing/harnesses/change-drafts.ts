import { Command, CommanderError } from "commander";
import { spawn, spawnSync } from "node:child_process";
import { constants as fsConstants, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDraftDomain } from "@/interfaces/cli/draft";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { createChangeDraftStore } from "@/lib/change-drafts";
import {
  CHANGE_DRAFT,
  type ChangeDraftDependencies,
  changeDraftDependencies,
  type ChangeDraftDescriptor,
  type ChangeDraftStore,
  RETIRED_CHANGE_DRAFT_DIRECTORY,
} from "@/lib/change-drafts/contract";
import { withoutGitEnvironment } from "@/lib/git/environment";
import { branchScopesDir, changesScopeDir, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { PROPERTY_LEVEL, PROPERTY_TIMEOUTS_MS } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DRAFT_TEMP_PREFIX = "spx-draft-";
/**
 * The drafts location 21-draft-storage.pdr.md declares, written out here rather than composed
 * from the production scope constants, so a wrong constant moves the drafts away from this path.
 */
const DECLARED_DRAFTS_LAYOUT = ".spx/drafts";
const RETIRED_DRAFT_NAME = "retired.md";
const LINKED_WORKTREE_NAME = "linked";
/** How long a draft command may run with an open standard input before it counts as reading it. */
const OPEN_STDIN_TIMEOUT_MS = PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2];

function packagedCliPath(): string {
  return fileURLToPath(new URL("../../bin/spx.js", import.meta.url));
}

/** A published Change record and a verification run record beside the drafts. */
const SHARED_RECORD_NAMES = { change: "published-change.json", branch: "main", run: "run-record.jsonl" } as const;
const TEMP_GIT_ENV = {
  ...withoutGitEnvironment(process.env),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Draft fixture",
  GIT_AUTHOR_EMAIL: "draft@example.invalid",
  GIT_COMMITTER_NAME: "Draft fixture",
  GIT_COMMITTER_EMAIL: "draft@example.invalid",
};

export interface DraftCliObservation {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ChangeDraftEnv {
  readonly productDir: string;
  readonly draftsDir: string;
  readonly store: ChangeDraftStore;
  readonly dependencies: ChangeDraftDependencies;
  kindDir(kind: string): string;
  write(draft: ChangeDraftDescriptor, text: string): Promise<void>;
  read(draft: ChangeDraftDescriptor): Promise<string>;
  inspect(path: string): Promise<Stats>;
  readPath(path: string): Promise<string>;
  listPath(path: string): Promise<string[]>;
  setKindDirectoryMode(kind: string, mode: number): Promise<void>;
  makeVisibleToGit(): Promise<void>;
  obstructStorage(text: string): Promise<string>;
  addUnmanagedFile(kind: string, name: string, text: string): Promise<string>;
  addRetiredDraft(text: string): Promise<string>;
  addSharedRecords(text: string): Promise<string[]>;
  linkedWorktree(): Promise<{ productDir: string; store: ChangeDraftStore }>;
  symlinkStorage(): Promise<string>;
  symlinkDraft(kind: string, draftId: string, text: string): Promise<{ path: string; target: string }>;
  storeWith(dependencies: ChangeDraftDependencies): Promise<ChangeDraftStore>;
  placeDraft(kind: string, draftId: string): Promise<string>;
  runCli(args: readonly string[], cwd?: string): Promise<DraftCliObservation>;
  runPackagedCli(args: readonly string[], cwd?: string): DraftCliObservation;
  runPackagedCliWithOpenStdin(args: readonly string[]): Promise<DraftCliObservation & { timedOut: boolean }>;
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
    await fs.writeFile(ignorePath, `${STATE_STORE_SCOPE_PATH.SPX_DIR}/\n/${LINKED_WORKTREE_NAME}/\n`);
    const draftsDir = join(productDir, ...DECLARED_DRAFTS_LAYOUT.split("/"));
    const kindDir = (kind: string) => join(draftsDir, kind);
    const store = await createChangeDraftStore({ cwd: productDir });
    const env: ChangeDraftEnv = {
      productDir,
      draftsDir,
      store,
      dependencies: changeDraftDependencies,
      kindDir,
      write: (draft, text) => fs.writeFile(draft.path, text),
      read: (draft) => fs.readFile(draft.path, "utf8"),
      inspect: (path) => fs.lstat(path),
      readPath: (path) => fs.readFile(path, "utf8"),
      listPath: (path) => fs.readdir(path),
      setKindDirectoryMode: async (kind, mode) => {
        await fs.mkdir(kindDir(kind), { recursive: true, mode: fsConstants.S_IRWXU });
        await fs.chmod(kindDir(kind), mode);
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
      addUnmanagedFile: async (kind, name, text) => {
        await fs.mkdir(kindDir(kind), { recursive: true, mode: fsConstants.S_IRWXU });
        const path = join(kindDir(kind), `notes-${name}${CHANGE_DRAFT.extension}`);
        await fs.writeFile(path, text);
        return path;
      },
      addRetiredDraft: async (text) => {
        const directory = join(
          productDir,
          STATE_STORE_SCOPE_PATH.SPX_DIR,
          STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
          RETIRED_CHANGE_DRAFT_DIRECTORY,
        );
        await fs.mkdir(directory, { recursive: true, mode: fsConstants.S_IRWXU });
        const path = join(directory, RETIRED_DRAFT_NAME);
        await fs.writeFile(path, text);
        return path;
      },
      addSharedRecords: async (text) => {
        const paths = [
          join(changesScopeDir(productDir), SHARED_RECORD_NAMES.change),
          join(branchScopesDir(productDir), SHARED_RECORD_NAMES.branch, SHARED_RECORD_NAMES.run),
        ];
        for (const path of paths) {
          await fs.mkdir(dirname(path), { recursive: true, mode: fsConstants.S_IRWXU });
          await fs.writeFile(path, text);
        }
        return paths;
      },
      linkedWorktree: async () => {
        git(productDir, ["add", ".gitignore"]);
        git(productDir, ["commit", "--quiet", "-m", "Create fixture"]);
        const linkedDir = join(productDir, LINKED_WORKTREE_NAME);
        git(productDir, ["worktree", "add", "--quiet", "--detach", linkedDir]);
        return { productDir: linkedDir, store: await createChangeDraftStore({ cwd: linkedDir }) };
      },
      symlinkStorage: async () => {
        const target = join(productDir, "outside");
        await fs.mkdir(target);
        await fs.symlink(target, join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR));
        return target;
      },
      symlinkDraft: async (kind, draftId, text) => {
        const target = join(productDir, "outside.md");
        const path = join(kindDir(kind), `${draftId}${CHANGE_DRAFT.extension}`);
        await fs.mkdir(kindDir(kind), { recursive: true, mode: fsConstants.S_IRWXU });
        await fs.writeFile(target, text);
        await fs.symlink(target, path);
        return { path, target };
      },
      storeWith: (dependencies) => createChangeDraftStore({ cwd: productDir, dependencies }),
      placeDraft: async (kind, draftId) => {
        await fs.mkdir(kindDir(kind), { recursive: true, mode: fsConstants.S_IRWXU });
        const path = join(kindDir(kind), `${draftId}${CHANGE_DRAFT.extension}`);
        await fs.writeFile(path, "", { mode: CHANGE_DRAFT.fileMode });
        return path;
      },
      runPackagedCliWithOpenStdin: (args) =>
        new Promise((resolveObservation) => {
          const child = spawn(process.execPath, [packagedCliPath(), ...args], {
            cwd: productDir,
            env: TEMP_GIT_ENV,
            stdio: ["pipe", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          let timedOut = false;
          child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8");
          });
          child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8");
          });
          const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
          }, OPEN_STDIN_TIMEOUT_MS);
          child.on("close", (status) => {
            clearTimeout(timer);
            resolveObservation({ status, stdout, stderr, timedOut });
          });
        }),
      runCli: async (args, cwd = productDir) => {
        let status = 0;
        let stdout = "";
        let stderr = "";
        const program = createCliProgram({
          domains: [createDraftDomain()],
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
      runPackagedCli: (args, cwd = productDir) => {
        const result = spawnSync(process.execPath, [
          packagedCliPath(),
          ...args,
        ], {
          cwd,
          env: TEMP_GIT_ENV,
          encoding: "utf8",
          timeout: PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2],
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

export function fixedIdDependencies(env: ChangeDraftEnv, ids: readonly string[]): ChangeDraftDependencies {
  let index = 0;
  return {
    ...env.dependencies,
    generateId: () => {
      const id = ids[index];
      index += 1;
      return id;
    },
  };
}

// Failure simulation: retain the real exclusive open and cleanup, fail when the new file closes.
export function failingDraftCloseDependencies(env: ChangeDraftEnv): ChangeDraftDependencies {
  return {
    ...env.dependencies,
    fs: {
      ...env.dependencies.fs,
      openExclusive: async (path, mode) => {
        const file = await env.dependencies.fs.openExclusive(path, mode);
        return {
          close: async () => {
            await file.close();
            throw new Error(`Injected close failure at ${path}`);
          },
        };
      },
    },
  };
}

/** The fields a UUID string carries, read by position; the executed test judges them. */
export interface UuidFields {
  readonly hex: string;
  readonly versionNibble: number;
  readonly variantBits: number;
  readonly timestampMs: number;
}

const UUID_LAYOUT = { timestampDigits: 12, versionDigit: 12, variantDigit: 16, variantShift: 2, radix: 16 } as const;

export function uuidFields(id: string): UuidFields {
  const hex = id.replaceAll("-", "");
  return {
    hex,
    versionNibble: Number.parseInt(hex[UUID_LAYOUT.versionDigit] ?? "", UUID_LAYOUT.radix),
    variantBits: Number.parseInt(hex[UUID_LAYOUT.variantDigit] ?? "", UUID_LAYOUT.radix) >> UUID_LAYOUT.variantShift,
    timestampMs: Number.parseInt(hex.slice(0, UUID_LAYOUT.timestampDigits), UUID_LAYOUT.radix),
  };
}

/** The code point of each character of a text, in order. */
export function codePoints(text: string): number[] {
  return [...text].map((character) => character.codePointAt(0) ?? 0);
}
