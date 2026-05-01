import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { isUnderExcluded } from "./exclude";

export const ARTIFACT_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".source",
  ".git",
  "out",
  "coverage",
]);

const TYPESCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx"]);
const DECLARATION_SUFFIX = ".d.ts";

export async function walkTypescriptFiles(
  projectRoot: string,
  excludePaths: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  await walk(projectRoot, projectRoot, excludePaths, out);
  return out;
}

async function walk(
  dir: string,
  projectRoot: string,
  excludePaths: readonly string[],
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if (isNodeError(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ARTIFACT_DIRECTORIES.has(entry.name)) continue;
      const subdir = join(dir, entry.name);
      const rel = relative(projectRoot, subdir);
      if (isUnderExcluded(rel, excludePaths)) continue;
      await walk(subdir, projectRoot, excludePaths, out);
    } else if (entry.isFile()) {
      if (!isTypescriptSource(entry.name)) continue;
      out.push(join(dir, entry.name));
    }
  }
}

function isTypescriptSource(name: string): boolean {
  if (name.endsWith(DECLARATION_SUFFIX)) return false;
  const ext = extensionOf(name);
  return TYPESCRIPT_EXTENSIONS.has(ext);
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export function isTestFile(relPath: string): boolean {
  return /\.test\.tsx?$/.test(relPath);
}
