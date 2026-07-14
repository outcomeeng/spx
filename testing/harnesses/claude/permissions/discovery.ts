import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DISCOVERY_ERROR_MESSAGE, type FindSettingsFiles } from "@/commands/claude/settings/discovery";
import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import {
  arbitraryDiscoveryBoundaryScenario,
  arbitraryDiscoveryTree,
  arbitraryVaryingDepthDiscoveryTree,
  type DiscoveryTreeScenario,
  sampleScenario,
} from "@testing/generators/claude/permissions/scenarios";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withPermissionsTempDir } from "./temp-directory";

export async function assertDiscoversSettingsAtVaryingDepths(
  findSettingsFiles: FindSettingsFiles,
): Promise<void> {
  await withDiscoveryTree(
    sampleScenario(arbitraryVaryingDepthDiscoveryTree()),
    async (productDir, expectedPaths) => {
      assert.deepEqual(
        sortedPaths(await findSettingsFiles(productDir)),
        sortedPaths(expectedPaths),
      );
    },
  );
}

export async function assertDiscoveryRejectsInvalidRoots(
  findSettingsFiles: FindSettingsFiles,
): Promise<void> {
  await withPermissionsTempDir(async (productDir) => {
    const scenario = sampleScenario(arbitraryDiscoveryBoundaryScenario());
    const missingRoot = join(productDir, scenario.missingRootSegment);
    await assert.rejects(
      findSettingsFiles(missingRoot),
      (error: unknown) =>
        error instanceof Error
        && error.message.includes(DISCOVERY_ERROR_MESSAGE.DIRECTORY_NOT_FOUND)
        && error.message.includes(missingRoot),
    );

    const fileRoot = join(productDir, scenario.fileRootName);
    await writeFile(fileRoot, "");
    await assert.rejects(
      findSettingsFiles(fileRoot),
      (error: unknown) =>
        error instanceof Error
        && error.message.includes(DISCOVERY_ERROR_MESSAGE.PATH_NOT_DIRECTORY)
        && error.message.includes(fileRoot),
    );
  });
}

export async function assertDiscoveryReturnsOnlyExactTargets(
  findSettingsFiles: FindSettingsFiles,
): Promise<void> {
  await withPermissionsTempDir(async (productDir) => {
    const scenario = sampleScenario(arbitraryDiscoveryBoundaryScenario());
    const settingsDir = join(
      productDir,
      ...scenario.validParent,
      CLAUDE_SETTINGS_PATH.DIRECTORY,
    );
    const settingsPath = join(settingsDir, CLAUDE_SETTINGS_PATH.LOCAL_FILE);
    const outsideSettingsPath = join(
      productDir,
      ...scenario.outsideParent,
      CLAUDE_SETTINGS_PATH.LOCAL_FILE,
    );
    const nestedSettingsPath = join(
      settingsDir,
      ...scenario.nestedParent,
      CLAUDE_SETTINGS_PATH.DIRECTORY,
      CLAUDE_SETTINGS_PATH.LOCAL_FILE,
    );

    await mkdir(settingsDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ permissions: {} }));
    await writeFile(join(settingsDir, scenario.decoyFileName), "");
    await mkdir(join(settingsDir, scenario.decoyDirectoryName));
    await mkdir(join(productDir, ...scenario.outsideParent), { recursive: true });
    await writeFile(outsideSettingsPath, JSON.stringify({ permissions: {} }));
    await mkdir(dirname(nestedSettingsPath), { recursive: true });
    await writeFile(nestedSettingsPath, JSON.stringify({ permissions: {} }));

    assert.deepEqual(await findSettingsFiles(productDir), [settingsPath]);
  });
}

export async function assertDiscoveryIsExhaustive(
  findSettingsFiles: FindSettingsFiles,
): Promise<void> {
  await assertProperty(
    arbitraryDiscoveryTree(),
    async (scenario) => {
      await withDiscoveryTree(scenario, async (productDir, expectedPaths) => {
        assert.deepEqual(
          sortedPaths(await findSettingsFiles(productDir)),
          sortedPaths(expectedPaths),
        );
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

function sortedPaths(paths: readonly string[]): string[] {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function withDiscoveryTree<T>(
  scenario: DiscoveryTreeScenario,
  callback: (productDir: string, expectedPaths: string[]) => Promise<T>,
): Promise<T> {
  return withPermissionsTempDir(async (productDir) => {
    const expectedPaths: string[] = [];
    for (const settingsParent of scenario.settingsParents) {
      const settingsDir = join(productDir, ...settingsParent, CLAUDE_SETTINGS_PATH.DIRECTORY);
      const settingsPath = join(settingsDir, CLAUDE_SETTINGS_PATH.LOCAL_FILE);
      await mkdir(settingsDir, { recursive: true });
      await writeFile(settingsPath, JSON.stringify({ permissions: {} }));
      expectedPaths.push(settingsPath);
    }
    return callback(productDir, expectedPaths);
  });
}
