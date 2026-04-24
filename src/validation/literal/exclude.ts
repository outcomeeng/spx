import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXCLUDE_FILENAME = "EXCLUDE";
const SPX_DIR = "spx";

export async function readExcludePaths(projectRoot: string): Promise<readonly string[]> {
  const filePath = join(projectRoot, SPX_DIR, EXCLUDE_FILENAME);
  try {
    const content = await readFile(filePath, "utf8");
    return parseExcludeContent(content);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export function isUnderExcluded(
  relPath: string,
  excludePaths: readonly string[],
): boolean {
  for (const raw of excludePaths) {
    const prefix = `${SPX_DIR}/${raw}`;
    if (relPath === prefix || relPath.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

function parseExcludeContent(content: string): readonly string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}
