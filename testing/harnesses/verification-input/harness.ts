/**
 * Real-filesystem harness for verification-input evidence: a temporary Git worktree whose files,
 * directories, symbolic links, and permissions the caller arranges, with observations of the tree
 * before and after an inspection. It returns observations and handles, never verdicts.
 */
import { execa } from "execa";
import { chmod, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { VERIFICATION_INPUT_REJECTION, type VerificationInputRejection } from "@/lib/verification-input";
import {
  referenceSha256,
  sampleVerificationInputValue,
  VERIFICATION_INPUT_TEST_GENERATOR,
} from "@testing/generators/verification-input";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_PREFIX = "spx-verification-input-";
const GIT_BINARY = "git";
const GIT_INIT_ARGS = ["init", "--quiet"] as const;
const UNREADABLE_MODE = 0o000;
const OUTSIDE_DIRECTORY_PREFIX = "spx-verification-input-outside-";

export interface VerificationInputEnv {
  /** Absolute path of the worktree root. */
  readonly root: string;
  /** Absolute path of a directory outside the worktree, removed with the environment. */
  readonly outsideDir: string;
  writeFile(relativePath: string, bytes: Uint8Array | string): Promise<string>;
  makeDirectory(relativePath: string): Promise<string>;
  symlink(target: string, relativeLinkPath: string): Promise<string>;
  makeUnreadable(relativePath: string): Promise<void>;
  /** Path to digest of every file and symlink-free directory entry under the worktree, excluding `.git`. */
  snapshot(): Promise<ReadonlyMap<string, string>>;
}

async function walk(root: string, relative: string, entries: Map<string, string>): Promise<void> {
  const directory = join(root, relative);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (child === ".git") continue;
    if (entry.isDirectory()) {
      entries.set(child, "directory");
      await walk(root, child, entries);
    } else if (entry.isFile()) {
      entries.set(child, referenceSha256(await readFile(join(root, child))));
    } else {
      entries.set(child, "other");
    }
  }
}

export async function withVerificationInputEnv<T>(
  callback: (env: VerificationInputEnv) => Promise<T>,
): Promise<T> {
  return withTempDir(TEMP_PREFIX, async (root) =>
    withTempDir(OUTSIDE_DIRECTORY_PREFIX, async (outsideDir) => {
      await execa(GIT_BINARY, [...GIT_INIT_ARGS], { cwd: root });
      const env: VerificationInputEnv = {
        root,
        outsideDir,
        async writeFile(relativePath, bytes) {
          const absolute = join(root, relativePath);
          await mkdir(dirname(absolute), { recursive: true });
          await writeFile(absolute, bytes);
          return absolute;
        },
        async makeDirectory(relativePath) {
          const absolute = join(root, relativePath);
          await mkdir(absolute, { recursive: true });
          return absolute;
        },
        async symlink(target, relativeLinkPath) {
          const absolute = join(root, relativeLinkPath);
          await mkdir(dirname(absolute), { recursive: true });
          await symlink(target, absolute);
          return absolute;
        },
        async makeUnreadable(relativePath) {
          await chmod(join(root, relativePath), UNREADABLE_MODE);
        },
        async snapshot() {
          const entries = new Map<string, string>();
          await walk(root, "", entries);
          return entries;
        },
      };
      return callback(env);
    }));
}

export interface ArrangedRejectionCase {
  /** The operand a caller supplies; its inspection violates the rejection's rule. */
  readonly operand: string;
}

const PARENT_TRAVERSAL = "..";

/**
 * Arranges the real filesystem state whose inspection violates the named rejection rule and
 * returns the operand to inspect. The harness builds the violation; the linked test owns the verdict.
 */
export async function arrangeRejectionCase(
  env: VerificationInputEnv,
  reason: VerificationInputRejection,
  relativePath: string,
): Promise<ArrangedRejectionCase> {
  switch (reason) {
    case VERIFICATION_INPUT_REJECTION.UNRESOLVED:
      return { operand: relativePath };
    case VERIFICATION_INPUT_REJECTION.AMBIGUOUS: {
      const name = relativePath.split("/").pop() ?? relativePath;
      await env.writeFile(`first/${name}`, name);
      await env.writeFile(`second/${name}`, name);
      return { operand: name };
    }
    case VERIFICATION_INPUT_REJECTION.NOT_REGULAR_FILE:
      await env.makeDirectory(relativePath);
      return { operand: relativePath };
    case VERIFICATION_INPUT_REJECTION.UNREADABLE:
      await env.writeFile(relativePath, relativePath);
      await env.makeUnreadable(relativePath);
      return { operand: relativePath };
    case VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_TRAVERSAL: {
      const outside = await writeOutside(env, relativePath);
      return { operand: `${PARENT_TRAVERSAL}/${outside.split("/").slice(-2).join("/")}` };
    }
    case VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_SYMLINK: {
      const outside = await writeOutside(env, relativePath);
      await env.symlink(outside, relativePath);
      return { operand: relativePath };
    }
    case VERIFICATION_INPUT_REJECTION.INVALID_UTF8:
      await env.writeFile(
        relativePath,
        sampleVerificationInputValue(VERIFICATION_INPUT_TEST_GENERATOR.invalidUtf8()),
      );
      return { operand: relativePath };
  }
}

async function writeOutside(env: VerificationInputEnv, relativePath: string): Promise<string> {
  const name = relativePath.split("/").pop() ?? relativePath;
  const target = join(env.outsideDir, name);
  await writeFile(target, name);
  return target;
}
