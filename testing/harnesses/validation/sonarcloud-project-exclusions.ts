import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

const PROPERTIES_FILE_ENCODING = "utf8";
const SONARCLOUD_PROPERTIES_FILE = ".sonarcloud.properties";
const COMMENT_PREFIXES = ["#", "!"] as const;
const PROPERTY_SEPARATORS = ["=", ":"] as const;
const ANALYSIS_EXCLUSION_KEYS: readonly string[] = ["sonar.exclusions"];
const ISSUE_EXCLUSION_PREFIX = "sonar.issue.ignore";
const FIXTURE_EXCLUSION_PATTERN = "testing/fixtures";

interface PropertiesEntry {
  readonly key: string;
  readonly value: string;
}

function isComment(line: string): boolean {
  return COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function separatorIndex(line: string): number {
  const explicitSeparatorIndexes = PROPERTY_SEPARATORS.map((separator) => line.indexOf(separator))
    .filter((index) => index >= 0);
  const whitespaceSeparatorIndex = line.search(/\s/u);
  const separatorIndexes = whitespaceSeparatorIndex >= 0
    ? [...explicitSeparatorIndexes, whitespaceSeparatorIndex]
    : explicitSeparatorIndexes;

  return separatorIndexes.length === 0 ? -1 : Math.min(...separatorIndexes);
}

function parseProperties(content: string): readonly PropertiesEntry[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isComment(line))
    .map((line) => {
      const index = separatorIndex(line);
      if (index < 0) {
        return { key: line, value: "" };
      }
      return {
        key: line.slice(0, index).trim(),
        value: line.slice(index + 1).trim(),
      };
    });
}

async function readProductSonarCloudProperties(): Promise<readonly PropertiesEntry[]> {
  return parseProperties(await readFile(join(process.cwd(), SONARCLOUD_PROPERTIES_FILE), PROPERTIES_FILE_ENCODING));
}

export async function assertSonarCloudPropertiesDeclareNoProjectExclusions(): Promise<void> {
  const entries = await readProductSonarCloudProperties();
  const keys = entries.map((entry) => entry.key);

  expect(keys.some((key) => ANALYSIS_EXCLUSION_KEYS.includes(key))).toBe(false);
  expect(entries.some((entry) => entry.key.startsWith(ISSUE_EXCLUSION_PREFIX))).toBe(false);
  expect(entries.some((entry) => entry.value.includes(FIXTURE_EXCLUSION_PATTERN))).toBe(false);
}
