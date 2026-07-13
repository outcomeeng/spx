import fc from "fast-check";

import { formatPermission } from "@/lib/claude/permissions/parser";
import {
  type ClaudeSettings,
  type Permission,
  PERMISSION_CATEGORY,
  type PermissionCategory,
  type Permissions,
} from "@/lib/claude/permissions/types";

const SCENARIO_SAMPLE_SEED = 46_021;
const SCENARIO_SAMPLE_COUNT = 1;

export interface DiscoveryTreeScenario {
  readonly settingsParents: readonly (readonly string[])[];
}

export interface ValidSettingsScenario {
  readonly settings: ClaudeSettings;
  readonly expectedPermissions: readonly Permission[];
}

export interface ParserFileScenario {
  readonly relativePath: string;
  readonly content: string;
  readonly valid: boolean;
}

export function arbitraryDiscoveryTree(): fc.Arbitrary<DiscoveryTreeScenario> {
  return fc.uniqueArray(arbitrarySettingsParent(), {
    minLength: 1,
    maxLength: 8,
    selector: (segments) => segments.join("/"),
  }).map((settingsParents) => ({ settingsParents }));
}

export function arbitraryVaryingDepthDiscoveryTree(): fc.Arbitrary<DiscoveryTreeScenario> {
  return fc.uniqueArray(arbitraryPathSegment(), { minLength: 6, maxLength: 6 }).map(
    ([first, second, third, fourth, fifth, sixth]) => ({
      settingsParents: [
        [first],
        [second, third],
        [fourth, fifth, sixth],
      ],
    }),
  );
}

export function arbitraryValidSettings(): fc.Arbitrary<ValidSettingsScenario> {
  return fc.uniqueArray(arbitraryPermission(), {
    minLength: 1,
    maxLength: 8,
    selector: (permission) => `${permission.category}:${permission.raw}`,
  }).map(validSettingsScenario);
}

export function arbitraryParserSequence(): fc.Arbitrary<readonly ParserFileScenario[]> {
  return fc.uniqueArray(arbitraryParserFile(), {
    minLength: 0,
    maxLength: 8,
    selector: (file) => file.relativePath,
  });
}

export function arbitraryMalformedThenValidSequence(): fc.Arbitrary<readonly ParserFileScenario[]> {
  return fc.tuple(
    fc.uniqueArray(arbitraryJsonFileName(), { minLength: 2, maxLength: 2 }),
    arbitraryMalformedJson(),
    arbitraryValidSettings(),
  ).map(([fileNames, malformedContent, validSettings]) => [
    { relativePath: fileNames[0], content: malformedContent, valid: false },
    { relativePath: fileNames[1], content: JSON.stringify(validSettings.settings), valid: true },
  ]);
}

export function sampleScenario<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, {
    seed: SCENARIO_SAMPLE_SEED,
    numRuns: SCENARIO_SAMPLE_COUNT,
  })[0];
}

function arbitrarySettingsParent(): fc.Arbitrary<readonly string[]> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 6 });
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
}

function arbitraryJsonFileName(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((segment) => `${segment}.json`);
}

function arbitraryPermission(): fc.Arbitrary<Permission> {
  return fc.tuple(
    fc.stringMatching(/^[A-Z][A-Za-z]{0,9}$/),
    fc.stringMatching(/^[a-z][a-z0-9:_/-]{0,15}$/),
    arbitraryPermissionCategory(),
  ).map(([type, scope, category]) => ({
    raw: formatPermission(type, scope),
    type,
    scope,
    category,
  }));
}

function arbitraryPermissionCategory(): fc.Arbitrary<PermissionCategory> {
  return fc.constantFrom(...Object.values(PERMISSION_CATEGORY));
}

function validSettingsScenario(expectedPermissions: Permission[]): ValidSettingsScenario {
  const permissions: Permissions = {};
  for (const permission of expectedPermissions) {
    permissions[permission.category] ??= [];
    permissions[permission.category]?.push(permission.raw);
  }
  return {
    settings: { permissions },
    expectedPermissions: Object.values(PERMISSION_CATEGORY).flatMap((category) =>
      expectedPermissions.filter((permission) => permission.category === category)
    ),
  };
}

function arbitraryParserFile(): fc.Arbitrary<ParserFileScenario> {
  return fc.oneof(
    fc.tuple(arbitraryJsonFileName(), arbitraryValidSettings()).map(([relativePath, scenario]) => ({
      relativePath,
      content: JSON.stringify(scenario.settings),
      valid: true,
    })),
    fc.tuple(arbitraryJsonFileName(), arbitraryMalformedJson()).map(([relativePath, content]) => ({
      relativePath,
      content,
      valid: false,
    })),
  );
}

function arbitraryMalformedJson(): fc.Arbitrary<string> {
  return fc.string().filter((content) => {
    try {
      JSON.parse(content);
      return false;
    } catch {
      return true;
    }
  });
}
