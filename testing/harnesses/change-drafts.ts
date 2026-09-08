import { spawnSync } from "node:child_process";
import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { createChangeDraftStore } from "@/lib/change-drafts";
import {
  CHANGE_DRAFT,
  type ChangeDraftDependencies,
  changeDraftDependencies,
  type ChangeDraftDescriptor,
  type ChangeDraftStore,
} from "@/lib/change-drafts/contract";
import { withoutGitEnvironment } from "@/lib/git/environment";
import { STATE_STORE_SCOPE_PATH, worktreeScopeDir } from "@/lib/state-store";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DRAFT_TEMP_PREFIX = "spx-change-draft-";
const CLI_ENTRY = resolve(import.meta.dirname, "../../bin/spx.js");
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
  readonly draftDir: string;
  readonly store: ChangeDraftStore;
  readonly dependencies: ChangeDraftDependencies;
  read(draft: ChangeDraftDescriptor): Promise<string>;
  inspect(path: string): Promise<Stats>;
  readPath(path: string): Promise<string>;
  retainedNames(): Promise<string[]>;
  makeVisibleToGit(): Promise<void>;
  obstructStorage(text: string): Promise<void>;
  addUnmanagedFile(name: string, text: string): Promise<string>;
  sibling(): Promise<{ productDir: string; store: ChangeDraftStore }>;
  symlinkStorage(): Promise<string>;
  symlinkDraft(draftId: string, text: string): Promise<{ path: string; target: string }>;
  runCli(args: readonly string[], input?: string, cwd?: string): DraftCliObservation;
}

function git(productDir: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], { cwd: productDir, env: TEMP_GIT_ENV, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Temporary repository command failed: ${result.stderr}`, { cause: result.error });
  }
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
      makeVisibleToGit: () =>
        fs.writeFile(
          ignorePath,
          `!${STATE_STORE_SCOPE_PATH.SPX_DIR}/\n!${STATE_STORE_SCOPE_PATH.SPX_DIR}/**\n`,
        ),
      obstructStorage: (text) => fs.writeFile(join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR), text),
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
      runCli: (args, input, cwd = productDir) => {
        const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
          cwd,
          input,
          encoding: "utf8",
          env: TEMP_GIT_ENV,
        });
        if (result.error) throw result.error;
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
