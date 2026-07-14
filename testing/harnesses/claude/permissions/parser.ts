import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import { SETTINGS_FILE_PARSE_STATUS, type SettingsFileParseResult } from "@/domains/claude/settings/types";
import {
  arbitraryMalformedThenValidSequence,
  arbitraryParserSequence,
  arbitraryValidSettings,
  type ParserFileScenario,
  sampleScenario,
} from "@testing/generators/claude/permissions/scenarios";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withPermissionsTempDir } from "./temp-directory";

export type ParseSettingsFile = (filePath: string) => Promise<SettingsFileParseResult>;
export type ParseAllSettings = (
  filePaths: readonly string[],
) => Promise<SettingsFileParseResult[]>;

export async function assertExtractsTypedPermissionRecords(
  parseSettingsFile: ParseSettingsFile,
): Promise<void> {
  await withPermissionsTempDir(async (productDir) => {
    const scenario = sampleScenario(arbitraryValidSettings());
    const filePath = join(productDir, CLAUDE_SETTINGS_PATH.LOCAL_FILE);
    await writeFile(filePath, JSON.stringify(scenario.settings));
    const result = await parseSettingsFile(filePath);

    assert.equal(result.status, SETTINGS_FILE_PARSE_STATUS.SUCCESS);
    assert.equal(result.filePath, filePath);
    assert.deepEqual(result.permissions, scenario.expectedPermissions);
  });
}

export async function assertReportsMalformedFileAndContinues(
  parseAllSettings: ParseAllSettings,
): Promise<void> {
  await withPermissionsTempDir(async (productDir) => {
    const filePaths = await writeParserFiles(
      productDir,
      sampleScenario(arbitraryMalformedThenValidSequence()),
    );
    const results = await parseAllSettings(filePaths);

    assert.equal(results.length, filePaths.length);
    assert.equal(results[0]?.status, SETTINGS_FILE_PARSE_STATUS.ERROR);
    assert.equal(results[0]?.filePath, filePaths[0]);
    assert.equal(results[1]?.status, SETTINGS_FILE_PARSE_STATUS.SUCCESS);
    assert.equal(results[1]?.filePath, filePaths[1]);
  });
}

export async function assertParsingPreservesCardinalityAndOrder(
  parseAllSettings: ParseAllSettings,
): Promise<void> {
  await assertProperty(
    arbitraryParserSequence(),
    async (scenario) => {
      await withPermissionsTempDir(async (productDir) => {
        const filePaths = await writeParserFiles(productDir, scenario);
        const results = await parseAllSettings(filePaths);

        assert.equal(results.length, filePaths.length);
        assert.deepEqual(results.map((result) => result.filePath), filePaths);
        assert.deepEqual(
          results.map((result) => result.status),
          scenario.map((file) => file.valid ? SETTINGS_FILE_PARSE_STATUS.SUCCESS : SETTINGS_FILE_PARSE_STATUS.ERROR),
        );
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

async function writeParserFiles(
  productDir: string,
  scenario: readonly ParserFileScenario[],
): Promise<string[]> {
  const filePaths: string[] = [];
  for (const file of scenario) {
    const filePath = join(productDir, file.relativePath);
    await writeFile(filePath, file.content);
    filePaths.push(filePath);
  }
  return filePaths;
}
