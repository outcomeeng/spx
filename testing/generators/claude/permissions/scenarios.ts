import fc from "fast-check";

import { formatPermission } from "@/domains/claude/settings/parser";
import {
  type ClaudeSettings,
  type Permission,
  PERMISSION_CATEGORY,
  type PermissionCategory,
  type Permissions,
  SCOPE_PATH_PREFIX,
} from "@/domains/claude/settings/types";
import { compareAsciiStrings } from "@/lib/state-store";

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

export interface ConsolidationProjectScenario {
  readonly relativeDirectory: string;
  readonly settings: ClaudeSettings;
}

export interface ConsolidationCliScenario {
  readonly projects: readonly ConsolidationProjectScenario[];
  readonly expectedAllowPermissions: readonly string[];
  readonly outputPathSegments: readonly string[];
}

export interface PermissionMergeScenario {
  readonly global: Permissions;
  readonly local: Permissions[];
}

export interface PermissionMergePermutationScenario extends PermissionMergeScenario {
  readonly permutedLocal: Permissions[];
}

export interface PermissionUnionScenario extends PermissionMergeScenario {
  readonly expectedMerged: Permissions;
}

export interface PermissionConflictScenario extends PermissionMergeScenario {
  readonly permission: string;
}

export interface SubsumptionChainScenario {
  readonly broader: Permission;
  readonly middle: Permission;
  readonly narrower: Permission;
}

export interface EmbeddedPathTokenCommandScenario {
  readonly scope: string;
}

export interface SharedCommandPrefixScenario {
  readonly broader: Permission;
  readonly distinct: Permission;
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

export function arbitraryConsolidationCliScenario(): fc.Arbitrary<ConsolidationCliScenario> {
  return fc.tuple(
    fc.tuple(arbitraryPathSegment(), arbitraryPathSegment()).filter(
      ([left, right]) => left !== right,
    ),
    fc.tuple(
      arbitraryPermission(PERMISSION_CATEGORY.ALLOW),
      arbitraryPermission(PERMISSION_CATEGORY.ALLOW),
    ).filter(([left, right]) => left.raw !== right.raw),
    fc.tuple(arbitraryPathSegment(), arbitraryPathSegment()),
  ).map(
    (
      [
        [firstProject, secondProject],
        [firstPermission, secondPermission],
        [outputDir, outputName],
      ],
    ) => ({
      projects: [
        {
          relativeDirectory: firstProject,
          settings: { permissions: { allow: [firstPermission.raw] } },
        },
        {
          relativeDirectory: secondProject,
          settings: { permissions: { allow: [secondPermission.raw] } },
        },
      ],
      expectedAllowPermissions: [firstPermission.raw, secondPermission.raw],
      outputPathSegments: [outputDir, `${outputName}.json`],
    }),
  );
}

export function arbitraryPermissionMergeScenario(): fc.Arbitrary<PermissionMergeScenario> {
  return fc.record({
    global: arbitraryPermissions(),
    local: fc.array(arbitraryPermissions(), { maxLength: 8 }),
  });
}

export function arbitraryPermissionMergePermutationScenario(): fc.Arbitrary<PermissionMergePermutationScenario> {
  return arbitraryPermissionMergeScenario().chain((scenario) =>
    fc.shuffledSubarray(scenario.local, {
      minLength: scenario.local.length,
      maxLength: scenario.local.length,
    }).map((permutedLocal) => ({ ...scenario, permutedLocal }))
  );
}

export function arbitraryPermissionUnionScenario(): fc.Arbitrary<PermissionUnionScenario> {
  return fc.uniqueArray(arbitraryPermission(PERMISSION_CATEGORY.ALLOW), {
    minLength: 2,
    maxLength: 8,
    selector: (permission) => permission.type,
  }).map(([globalPermission, ...localPermissions]) => ({
    global: { allow: [globalPermission.raw] },
    local: localPermissions.map((permission) => ({ allow: [permission.raw] })),
    expectedMerged: {
      allow: [globalPermission, ...localPermissions]
        .map((permission) => permission.raw)
        .sort(compareAsciiStrings),
    },
  }));
}

export function arbitraryPermissionConflictScenario(): fc.Arbitrary<PermissionConflictScenario> {
  return arbitraryPermission(PERMISSION_CATEGORY.ALLOW).map((permission) => ({
    global: { allow: [permission.raw] },
    local: [{ deny: [permission.raw] }],
    permission: permission.raw,
  }));
}

export function arbitrarySubsumptionChain(): fc.Arbitrary<SubsumptionChainScenario> {
  return fc.oneof(arbitraryCommandSubsumptionChain(), arbitraryPathSubsumptionChain());
}

export function arbitraryEmbeddedPathTokenCommand(): fc.Arbitrary<EmbeddedPathTokenCommandScenario> {
  return fc.tuple(arbitraryPathSegment(), arbitraryPathSegment()).map(([command, path]) => ({
    scope: `${command} ${SCOPE_PATH_PREFIX.PATH}/${path}`,
  }));
}

export function arbitrarySharedCommandPrefix(): fc.Arbitrary<SharedCommandPrefixScenario> {
  return fc.tuple(
    fc.stringMatching(/^[A-Z][A-Za-z]{0,9}$/),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
  ).map(([type, command, suffix]) => ({
    broader: permission(type, `${command}:*`),
    distinct: permission(type, `${command}${suffix}:*`),
  }));
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

export function arbitraryPermission(fixedCategory?: PermissionCategory): fc.Arbitrary<Permission> {
  return fc.tuple(
    fc.stringMatching(/^[A-Z][A-Za-z]{0,9}$/),
    fc.stringMatching(/^[a-z][a-z0-9:_/-]{0,15}$/),
    fixedCategory === undefined
      ? arbitraryPermissionCategory()
      : fc.constant(fixedCategory),
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

export function arbitraryPermissions(): fc.Arbitrary<Permissions> {
  return fc.record({
    allow: fc.array(
      arbitraryPermission(PERMISSION_CATEGORY.ALLOW).map((permission) => permission.raw),
      { maxLength: 8 },
    ),
    deny: fc.array(
      arbitraryPermission(PERMISSION_CATEGORY.DENY).map((permission) => permission.raw),
      { maxLength: 8 },
    ),
    ask: fc.array(
      arbitraryPermission(PERMISSION_CATEGORY.ASK).map((permission) => permission.raw),
      { maxLength: 8 },
    ),
  });
}

function arbitraryCommandSubsumptionChain(): fc.Arbitrary<SubsumptionChainScenario> {
  return fc.tuple(
    fc.stringMatching(/^[A-Z][A-Za-z]{0,9}$/),
    fc.array(arbitraryPathSegment(), { minLength: 3, maxLength: 3 }),
  ).map(([type, [base, middle, narrower]]) =>
    subsumptionChain(
      type,
      `${base}:*`,
      `${base} ${middle}:*`,
      `${base} ${middle} ${narrower}:*`,
    )
  );
}

function arbitraryPathSubsumptionChain(): fc.Arbitrary<SubsumptionChainScenario> {
  return fc.tuple(
    fc.stringMatching(/^[A-Z][A-Za-z]{0,9}$/),
    fc.array(arbitraryPathSegment(), { minLength: 3, maxLength: 3 }),
  ).map(([type, [base, middle, narrower]]) =>
    subsumptionChain(
      type,
      `${SCOPE_PATH_PREFIX.FILE}/${base}/**`,
      `${SCOPE_PATH_PREFIX.FILE}/${base}/${middle}/**`,
      `${SCOPE_PATH_PREFIX.FILE}/${base}/${middle}/${narrower}/**`,
    )
  );
}

function subsumptionChain(
  type: string,
  broaderScope: string,
  middleScope: string,
  narrowerScope: string,
): SubsumptionChainScenario {
  return {
    broader: permission(type, broaderScope),
    middle: permission(type, middleScope),
    narrower: permission(type, narrowerScope),
  };
}

function permission(type: string, scope: string): Permission {
  return {
    raw: formatPermission(type, scope),
    type,
    scope,
    category: PERMISSION_CATEGORY.ALLOW,
  };
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
