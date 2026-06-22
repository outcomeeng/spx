/**
 * PATH executable resolution shared across the validation tool finder and the
 * diagnose spx-reachability probe. Resolves a bare tool name to an executable
 * file on `PATH`, honoring Windows `PATHEXT` candidate extensions so a tool
 * installed as `tool.cmd` / `tool.exe` resolves on Windows.
 *
 * @module lib/executable-on-path
 */

import fs from "node:fs";
import path from "node:path";

const PATH_ENVIRONMENT_VARIABLE = "PATH";
const WINDOWS_EXECUTABLE_EXTENSIONS_VARIABLE = "PATHEXT";
const WINDOWS_DEFAULT_EXECUTABLE_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"] as const;

function executableExtensions(): readonly string[] {
  if (process.platform !== "win32") {
    return [""];
  }
  const pathExtensions = process.env[WINDOWS_EXECUTABLE_EXTENSIONS_VARIABLE]?.split(path.delimiter).filter(Boolean);
  return pathExtensions && pathExtensions.length > 0 ? pathExtensions : WINDOWS_DEFAULT_EXECUTABLE_EXTENSIONS;
}

/** The candidate filenames a bare tool name resolves to, expanded by `PATHEXT` on Windows. */
export function executableCandidateNames(tool: string): readonly string[] {
  if (process.platform !== "win32" || path.extname(tool) !== "") {
    return [tool];
  }
  return executableExtensions().map((extension) => `${tool}${extension}`);
}

function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolves `tool` to the first executable candidate found across `PATH`, or null when none resolves. */
export function findExecutableOnPath(tool: string): string | null {
  const pathValue = process.env[PATH_ENVIRONMENT_VARIABLE];
  if (!pathValue) {
    return null;
  }
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    for (const candidateName of executableCandidateNames(tool)) {
      const candidatePath = path.join(directory, candidateName);
      if (isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }
  return null;
}
