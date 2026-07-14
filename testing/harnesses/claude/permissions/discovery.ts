import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import {
  arbitraryDiscoveryTree,
  arbitraryVaryingDepthDiscoveryTree,
  type DiscoveryTreeScenario,
  sampleScenario,
} from "@testing/generators/claude/permissions/scenarios";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withPermissionsTempDir } from "./temp-directory";

export type FindSettingsFiles = (root: string) => Promise<string[]>;

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
