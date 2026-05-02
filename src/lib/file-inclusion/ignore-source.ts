import { readFileSync } from "node:fs";
import { join } from "node:path";

export const IGNORE_SOURCE_FILENAME_DEFAULT = "EXCLUDE";

export type IgnoreSourceReaderConfig = {
  readonly ignoreSourceFilename: string;
  readonly specTreeRootSegment: string;
};

export type IgnoreSourceEntry = {
  readonly segment: string;
  readonly lineNumber: number;
};

export type IgnoreSourceReader = {
  isUnderIgnoreSource(relativePath: string): boolean;
  entries(): readonly IgnoreSourceEntry[];
  matchedEntry(relativePath: string): IgnoreSourceEntry | undefined;
};

const COMMENT_PREFIX = "#";

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function validateEntry(entry: string, lineNumber: number): void {
  if (entry.startsWith("/")) {
    throw new Error(
      `Invalid ignore-source entry "${entry}" at line ${lineNumber}: absolute paths are not allowed`,
    );
  }
  const parts = entry.split("/");
  for (const part of parts) {
    if (part === ".." || part === "." || part === "") {
      throw new Error(
        `Invalid ignore-source entry "${entry}" at line ${lineNumber}: empty segments, traversal sequences, and dot-relative prefixes are not allowed`,
      );
    }
  }
}

export function createIgnoreSourceReader(
  projectRoot: string,
  config: IgnoreSourceReaderConfig,
): IgnoreSourceReader {
  const { ignoreSourceFilename, specTreeRootSegment } = config;
  const filePath = join(projectRoot, specTreeRootSegment, ignoreSourceFilename);

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      content = "";
    } else {
      throw err;
    }
  }

  const parsedEntries: IgnoreSourceEntry[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.length === 0 || trimmed.startsWith(COMMENT_PREFIX)) continue;
    const lineNumber = i + 1;
    validateEntry(trimmed, lineNumber);
    parsedEntries.push({ segment: trimmed, lineNumber });
  }

  const prefixes = parsedEntries.map((e) => `${specTreeRootSegment}/${e.segment}/`);

  return {
    isUnderIgnoreSource(relativePath: string): boolean {
      return prefixes.some((prefix) => relativePath.startsWith(prefix));
    },
    entries(): readonly IgnoreSourceEntry[] {
      return parsedEntries;
    },
    matchedEntry(relativePath: string): IgnoreSourceEntry | undefined {
      return parsedEntries.find((entry) => relativePath.startsWith(`${specTreeRootSegment}/${entry.segment}/`));
    },
  };
}
