import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { DEFAULT_CONFIG_FILENAME } from "@/config";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import type { SpecTreeNode, SpecTreeSnapshot } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { specContextAbbreviatedTarget } from "@testing/generators/spec-tree/context-target";
import {
  type RepresentativeSpecTreeFixture,
  RETIRED_SPEC_APPLY_FIXTURE,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

export type SpecCliContextTargetFixture = {
  readonly expectedTarget: string;
  readonly invocationTarget: string;
};

export type SpecCliApplyProtectionFixture = {
  readonly excludeContent: string;
  readonly protectedPaths: readonly string[];
  readonly pythonConfigContent: string;
};

export function specCliContextTargetFixture(
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
): SpecCliContextTargetFixture {
  const rootedTarget = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    specContextAbbreviatedTarget(snapshot, target),
  ].join(TRACKED_PATH_DIRECTORY_SEPARATOR);
  return {
    expectedTarget: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, target.id].join(TRACKED_PATH_DIRECTORY_SEPARATOR),
    invocationTarget: `${rootedTarget}${TRACKED_PATH_DIRECTORY_SEPARATOR}`,
  };
}

export function specCliApplyProtectionFixture(
  fixture: RepresentativeSpecTreeFixture,
): SpecCliApplyProtectionFixture {
  return {
    excludeContent: `${specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root)}\n`,
    protectedPaths: [
      DEFAULT_CONFIG_FILENAME,
      RETIRED_SPEC_APPLY_FIXTURE.excludeFile,
      RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile,
    ],
    pythonConfigContent: `[${RETIRED_SPEC_APPLY_FIXTURE.pytestSection}]\naddopts = ""\n`,
  };
}

export function specCliUnsupportedStatusFormat(fixture: RepresentativeSpecTreeFixture): string {
  const validFormats = new Set<string>(Object.values(OUTPUT_FORMAT));
  let candidate = `${fixture.root.slug}-${fixture.decision.slug}`;
  while (validFormats.has(candidate)) candidate = `${candidate}-${fixture.child.slug}`;
  return candidate;
}
