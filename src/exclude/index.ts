import { readFileSync } from "node:fs";
import { join } from "node:path";

export const EXCLUDE_FILENAME = "spx/EXCLUDE";
export const SPX_ROOT = "spx";
const COMMENT_PREFIX = "#";
const PATH_SEPARATOR = "/";
const PYTEST = "pytest";
const VITEST = "vitest";

export type ToolName = typeof PYTEST | typeof VITEST;

export interface ExcludeFilter {
  isExcluded(relativePath: string): boolean;
  toToolFlags(tool: ToolName): readonly string[];
}

export function createExcludeFilter(projectRoot: string): ExcludeFilter {
  const raw = readExcludeFile(projectRoot);
  const segments = raw === undefined ? [] : parseSegments(raw);
  const prefixes = segments.map((segment) => `${SPX_ROOT}/${segment}/`);

  return {
    isExcluded(relativePath) {
      return prefixes.some((prefix) => relativePath.startsWith(prefix));
    },
    toToolFlags(tool) {
      return segments.map((segment) => toolFlag(tool, segment));
    },
  };
}

function readExcludeFile(projectRoot: string): string | undefined {
  try {
    return readFileSync(join(projectRoot, EXCLUDE_FILENAME), "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

function parseSegments(raw: string): readonly string[] {
  const segments: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(COMMENT_PREFIX)) {
      continue;
    }
    const segment = stripTrailingSeparator(trimmed);
    assertValidSegment(segment);
    segments.push(segment);
  }
  return segments;
}

function stripTrailingSeparator(segment: string): string {
  return segment.endsWith(PATH_SEPARATOR) ? segment.slice(0, -1) : segment;
}

function assertValidSegment(segment: string): void {
  if (segment === "") {
    throw new Error(`spx/EXCLUDE entry is empty`);
  }
  if (segment.startsWith(PATH_SEPARATOR)) {
    throw new Error(`spx/EXCLUDE entry is absolute: ${segment}`);
  }
  const parts = segment.split(PATH_SEPARATOR);
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") {
      throw new Error(`spx/EXCLUDE entry escapes spx/: ${segment}`);
    }
  }
}

function toolFlag(tool: ToolName, segment: string): string {
  const prefix = `${SPX_ROOT}/${segment}`;
  switch (tool) {
    case PYTEST:
      return `--ignore=${prefix}/`;
    case VITEST:
      return `--exclude=${prefix}/**`;
  }
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}
