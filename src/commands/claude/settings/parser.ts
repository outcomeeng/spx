import { createSettingsFileParseError, parseSettingsContent } from "@/domains/claude/settings/parser";
import type { SettingsFileParseResult } from "@/domains/claude/settings/types";
import fs from "node:fs/promises";

export async function parseSettingsFile(
  filePath: string,
): Promise<SettingsFileParseResult> {
  try {
    return parseSettingsContent(filePath, await fs.readFile(filePath, "utf-8"));
  } catch (error) {
    return createSettingsFileParseError(filePath, error);
  }
}

export async function parseAllSettings(
  filePaths: readonly string[],
): Promise<SettingsFileParseResult[]> {
  return Promise.all(filePaths.map(parseSettingsFile));
}
