import type { RuleTester } from "eslint";

import {
  VALIDATION_EXIT_CODES,
  VALIDATION_PIPELINE,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";
import { ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID } from "@eslint-rules/no-async-spawn-outside-lifecycle";
import {
  BARE_STRING_UNION_MESSAGE_ID,
  NO_BARE_STRING_UNIONS_RULE_ID,
  NO_BARE_STRING_UNIONS_RULE_NAME,
} from "@eslint-rules/no-bare-string-unions";
import {
  EMPTY_SWALLOWING_MESSAGE_ID,
  HIDDEN_ASSERTIONS_MESSAGE_ID,
  NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_ID,
  NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_NAME,
} from "@eslint-rules/no-bdd-try-catch-anti-pattern";
import {
  DEEP_RELATIVE_IMPORT_MESSAGE_ID,
  NO_DEEP_RELATIVE_IMPORTS_RULE_ID,
  NO_DEEP_RELATIVE_IMPORTS_RULE_NAME,
} from "@eslint-rules/no-deep-relative-imports";
import { NO_HARDCODED_STATUSES_RULE_ID, USE_WORK_ITEM_STATUSES_MESSAGE_ID } from "@eslint-rules/no-hardcoded-statuses";
import {
  NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID,
  USE_WORK_ITEM_KINDS_MESSAGE_ID,
} from "@eslint-rules/no-hardcoded-work-item-kinds";
import {
  IMPORT_SOURCE_EXTENSION_MESSAGE_ID,
  NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID,
  NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME,
} from "@eslint-rules/no-import-source-extensions";
import {
  NO_REGISTRY_POSITION_ACCESS_RULE_ID,
  REGISTRY_POSITION_ACCESS_MESSAGE_ID,
} from "@eslint-rules/no-registry-position-access";
import {
  NO_SPEC_REFERENCES_RULE_ID,
  NO_SPEC_REFERENCES_RULE_NAME,
  SPEC_REFERENCE_MESSAGE_ID,
} from "@eslint-rules/no-spec-references";
import {
  NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
  TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID,
  TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID,
} from "@eslint-rules/no-test-owned-domain-constants";
import {
  NO_RESTRICTED_SYNTAX_RULE_ID,
  testRestrictedSyntax,
  tsRestrictedSyntax,
} from "@eslint-rules/restricted-syntax";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

const RULE_TESTER_ECMA_VERSION = 2022;
const AST_RULE_TESTER_ECMA_VERSION = 2023;
const MODULE_SOURCE_TYPE = "module";
const AFTER_ALL_HOOK_KEY = "afterAll";
const ZERO_DIAGNOSTICS = 0;
const SINGLE_DIAGNOSTIC = 1;
const DOUBLE_DIAGNOSTIC = 2;
const FIRST_RULE_INDEX = 0;
const SECOND_RULE_INDEX = 1;
const THIRD_RULE_INDEX = 2;
const FOURTH_RULE_INDEX = 3;
const FIFTH_RULE_INDEX = 4;
const ERROR_SEVERITY = 2;
const WARNING_SEVERITY = 1;

export interface ValidationGeneratedRuleTesterCases {
  readonly valid: RuleTester.ValidTestCase[] | string[];
  readonly invalid: RuleTester.InvalidTestCase[];
}

export interface ValidationGeneratedRuleTesterRun {
  readonly title: string;
  readonly ruleName: string;
  readonly cases: ValidationGeneratedRuleTesterCases;
}

export interface ValidationGeneratedRuleRegistrationCase {
  readonly title: string;
  readonly filePath: string;
  readonly ruleIds: readonly string[];
}

export interface ValidationGeneratedRuleExpectation {
  readonly ruleId: string;
  readonly count: number;
  readonly severity?: number;
}

export interface ValidationGeneratedLintScenario {
  readonly title: string;
  readonly code: string;
  readonly filePath: string;
  readonly expectations: readonly ValidationGeneratedRuleExpectation[];
}

export interface ValidationGeneratedConfigSeverityScenario {
  readonly title: string;
  readonly filePath: string;
  readonly expectations: ReadonlyArray<{
    readonly ruleId: string;
    readonly severity: number;
  }>;
}

export function validationRuleTesterHooks(): {
  readonly afterAllKey: string;
  readonly afterAll: () => void;
} {
  return {
    afterAllKey: AFTER_ALL_HOOK_KEY,
    afterAll: () => {},
  };
}

export function validationEslintRuleTesterLanguageOptions(): {
  readonly ecmaVersion: number;
  readonly sourceType: typeof MODULE_SOURCE_TYPE;
} {
  return {
    ecmaVersion: RULE_TESTER_ECMA_VERSION,
    sourceType: MODULE_SOURCE_TYPE,
  };
}

export function validationAstRuleTesterLanguageOptions(): {
  readonly ecmaVersion: number;
  readonly sourceType: typeof MODULE_SOURCE_TYPE;
} {
  return {
    ecmaVersion: AST_RULE_TESTER_ECMA_VERSION,
    sourceType: MODULE_SOURCE_TYPE,
  };
}

export const VALIDATION_ESLINT_EXPECTED = {
  zeroDiagnostics: ZERO_DIAGNOSTICS,
  singleDiagnostic: SINGLE_DIAGNOSTIC,
  doubleDiagnostics: DOUBLE_DIAGNOSTIC,
  totalPipelineSteps: VALIDATION_PIPELINE.TOTAL_STEPS,
  successExitCode: VALIDATION_EXIT_CODES.SUCCESS,
  failureExitCode: VALIDATION_EXIT_CODES.FAILURE,
  errorSeverity: ERROR_SEVERITY,
  warningSeverity: WARNING_SEVERITY,
} as const;

export const VALIDATION_ESLINT_FILES = {
  genericTest: "test.test.ts",
  genericSpec: "status.spec.ts",
  kindSpec: "parser.spec.ts",
  nestedTest: "tests/unit/state.ts",
  nestedScannerTest: "tests/unit/scanner.ts",
  doubleUnderscoreTest: "src/__tests__/state.ts",
  doubleUnderscoreParserTest: "src/__tests__/parser.ts",
  sourceTypes: "src/types.ts",
  sourceStatus: "src/status.ts",
  sourceParser: "src/parser.ts",
  sourceScannerWalk: "src/scanner/walk.ts",
  lifecycleModule: "src/lib/process-lifecycle/install.ts",
  lifecycleHarness: "testing/harnesses/process-lifecycle/spawn-fixture.ts",
  gitRoot: "src/git/root.ts",
  precommitRunner: "src/lib/precommit/run.ts",
  domainRunner: "src/some-domain/runner.ts",
  domainTypes: "src/some-domain/types.ts",
  sessionCommandExample: "src/commands/session/example.ts",
  eslintStep: "src/validation/steps/eslint.ts",
  unmanifestedSpecTest: "spx/31-spec-domain.capability/tests/new.mapping.l1.test.ts",
  manifestCoveredSpecTest:
    "spx/41-validation.enabler/21-validation-cli.enabler/tests/package-scripts.compliance.l1.test.ts",
  registrySpecTest: "spx/sample.enabler/tests/registry.mapping.l1.test.ts",
  sourceOwnedSpecTest: "spx/sample.enabler/tests/source-owned.mapping.l1.test.ts",
  supportFile: "spx/sample.enabler/tests/support.ts",
  productionSource: "src/spec-tree/source.ts",
  generatorModule: "testing/generators/spec-tree.ts",
  noSpecReferencesRuleFile: "eslint-rules/no-spec-references.ts",
} as const;

export const VALIDATION_ESLINT_SNIPPETS = {
  importSpawnNode: `import { spawn } from "node:child_process";`,
  importSpawnLegacy: `import { spawn } from "child_process";`,
  importExecSync: `import { execSync } from "node:child_process";`,
  importSpawnSync: `import { spawnSync } from "node:child_process";`,
  importExecAndExecFile: `import { exec, execFile } from "node:child_process";`,
  importChildProcessType: `import type { ChildProcess } from "node:child_process";`,
  importExecAndSpawn: `import { exec, spawn } from "node:child_process";`,
  nonRegistryIndex: `const first = values[0];`,
  registryIndexType: `type NodeKind = (typeof NODE_KINDS)[number];`,
  namedRegistryAccess: `const kind = WORK_ITEM_KINDS.STORY;`,
  legacyStatusRegistryIndex: `const status = WORK_ITEM_STATUSES[2];`,
  generatorRegistryPosition: `const kind = NODE_KINDS[0];`,
  decisionKindsPosition: `const kind = DECISION_KINDS[0];`,
  nodeKindsAssertionPosition: `expect(node.kind).toBe(NODE_KINDS[1]);`,
  importedSourceConstant: `import { NODE_KINDS } from "@/lib/spec-tree/config"; expect(kind).toBe(NODE_KINDS[0]);`,
  uppercaseTypeAlias: `type NODE_KIND = "enabler";`,
  uppercaseClass: `class NODE_BUILDER { build(): string { return "node"; } }`,
  generatedHelper: `const generatedNodeKind = sampleNodeKind(registry);`,
  localGeneratedConstant:
    `it("uses generated input", () => { const GENERATED_KIND = sampleNodeKind(registry); expect(GENERATED_KIND).toBeDefined(); });`,
  productionUppercaseConstant: `const NODE_KIND = "enabler";`,
  uppercaseConstant: `const NODE_KIND = "enabler";`,
  exportedUppercaseConstant: `export const NODE_KIND = "enabler";`,
  objectRegistry: `const sectionModes = { STRICT: "strict", LENIENT: "lenient" } as const;`,
  tupleRegistry: `const sectionModes = ["strict", "lenient"] as const;`,
  sourceOwnedStatuses: `import { WORK_ITEM_STATUSES } from "@/types"; expect(item.status).toBe(WORK_ITEM_STATUSES[0])`,
  sourceOwnedKinds: `import { WORK_ITEM_KINDS } from "@/types"; expect(item.kind).toBe(WORK_ITEM_KINDS[2])`,
  sourceOwnedLeafKind: `import { LEAF_KIND } from "@/types"; expect(item.kind).toBe(LEAF_KIND)`,
  donePathAssertion: `expect(file).toBe("DONE.md")`,
  nestedDonePathAssertion: `expect(path).toContain("tests/DONE.md")`,
  kindRegex: `const pattern = /^(capability|feature|story)-/`,
  statusObjectKeys: `const map = { OPEN: 1, IN_PROGRESS: 2, DONE: 3 }`,
  kindObjectKeys: `const map = { story: 1, feature: 2, capability: 3 }`,
  templateStatusDescription: "describe(`DONE status for ${name}`, () => {})",
  templateKindDescription: "describe(`story parsing for ${name}`, () => {})",
  bareStringUnion: `type Tier = "free" | "pro";`,
  internalSourceExtension: `import "./local.js";`,
  deepParentImport: `import "../../config";`,
  testOwnedConstantDeclaration: `const NODE_KIND = "enabler";`,
  crossKindStatusAssertions: `expect(item.kind).toBe("story"); expect(item.status).toBe("DONE");`,
  noSpecReferenceRuleId: NO_SPEC_REFERENCES_RULE_ID,
  noRestrictedSyntaxRuleId: NO_RESTRICTED_SYNTAX_RULE_ID,
} as const;

export function validationSourceFilePath(): string {
  return sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
}

export function validationTestFilePath(): string {
  return sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
}

export function noAsyncSpawnOutsideLifecycleCases(): ValidationGeneratedRuleTesterCases {
  return {
    valid: [
      {
        name: "lifecycle module imports spawn",
        code: VALIDATION_ESLINT_SNIPPETS.importSpawnNode,
        filename: VALIDATION_ESLINT_FILES.lifecycleModule,
      },
      {
        name: "test-infrastructure harness imports spawn",
        code: VALIDATION_ESLINT_SNIPPETS.importSpawnNode,
        filename: VALIDATION_ESLINT_FILES.lifecycleHarness,
      },
      {
        name: "synchronous execSync outside lifecycle is exempt",
        code: VALIDATION_ESLINT_SNIPPETS.importExecSync,
        filename: VALIDATION_ESLINT_FILES.gitRoot,
      },
      {
        name: "synchronous spawnSync outside lifecycle is exempt",
        code: VALIDATION_ESLINT_SNIPPETS.importSpawnSync,
        filename: VALIDATION_ESLINT_FILES.precommitRunner,
      },
      {
        name: "non-spawn child_process imports outside lifecycle are exempt",
        code: VALIDATION_ESLINT_SNIPPETS.importExecAndExecFile,
        filename: VALIDATION_ESLINT_FILES.domainRunner,
      },
      {
        name: "type-only spawn import is acceptable",
        code: VALIDATION_ESLINT_SNIPPETS.importChildProcessType,
        filename: VALIDATION_ESLINT_FILES.domainTypes,
      },
    ],
    invalid: [
      {
        name: "spawn import in domain code is rejected",
        code: VALIDATION_ESLINT_SNIPPETS.importSpawnNode,
        filename: VALIDATION_ESLINT_FILES.eslintStep,
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
      {
        name: "spawn alongside other named imports is rejected",
        code: VALIDATION_ESLINT_SNIPPETS.importExecAndSpawn,
        filename: VALIDATION_ESLINT_FILES.domainRunner,
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
      {
        name: "spawn import via legacy specifier is rejected",
        code: VALIDATION_ESLINT_SNIPPETS.importSpawnLegacy,
        filename: VALIDATION_ESLINT_FILES.domainRunner,
        errors: [{ messageId: ASYNC_SPAWN_OUTSIDE_LIFECYCLE_MESSAGE_ID }],
      },
    ],
  };
}

export function noRegistryPositionAccessCases(): ValidationGeneratedRuleTesterCases {
  return {
    valid: [
      {
        name: "GIVEN non-registry array index WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.nonRegistryIndex,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
      },
      {
        name: "GIVEN registry indexed access type WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.registryIndexType,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
      },
      {
        name: "GIVEN named registry access WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.namedRegistryAccess,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
      },
      {
        name: "GIVEN legacy work-item registry numeric index WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.legacyStatusRegistryIndex,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
      },
      {
        name: "GIVEN generator module samples registry by position WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.generatorRegistryPosition,
        filename: VALIDATION_ESLINT_FILES.generatorModule,
      },
    ],
    invalid: [
      {
        name: "GIVEN DECISION_KINDS numeric index WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.decisionKindsPosition,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
        errors: [{ messageId: REGISTRY_POSITION_ACCESS_MESSAGE_ID }],
      },
      {
        name: "GIVEN NODE_KINDS numeric index in assertion WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.nodeKindsAssertionPosition,
        filename: VALIDATION_ESLINT_FILES.registrySpecTest,
        errors: [{ messageId: REGISTRY_POSITION_ACCESS_MESSAGE_ID }],
      },
    ],
  };
}

export function noTestOwnedDomainConstantsCases(): ValidationGeneratedRuleTesterCases {
  return {
    valid: [
      {
        name: "GIVEN imported source-owned constant WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.importedSourceConstant,
        filename: VALIDATION_ESLINT_FILES.sourceOwnedSpecTest,
      },
      {
        name: "GIVEN uppercase type alias WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.uppercaseTypeAlias,
        filename: VALIDATION_ESLINT_FILES.supportFile,
      },
      {
        name: "GIVEN uppercase class declaration WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.uppercaseClass,
        filename: VALIDATION_ESLINT_FILES.supportFile,
      },
      {
        name: "GIVEN lower-case generated helper value WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.generatedHelper,
        filename: VALIDATION_ESLINT_FILES.supportFile,
      },
      {
        name: "GIVEN local uppercase constant inside test callback WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.localGeneratedConstant,
        filename: VALIDATION_ESLINT_FILES.sourceOwnedSpecTest,
      },
      {
        name: "GIVEN production uppercase constant WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.productionUppercaseConstant,
        filename: VALIDATION_ESLINT_FILES.productionSource,
      },
    ],
    invalid: [
      {
        name: "GIVEN top-level uppercase test constant WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.uppercaseConstant,
        filename: VALIDATION_ESLINT_FILES.sourceOwnedSpecTest,
        errors: [{ messageId: TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID }],
      },
      {
        name: "GIVEN exported uppercase support constant WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.exportedUppercaseConstant,
        filename: VALIDATION_ESLINT_FILES.supportFile,
        errors: [{ messageId: TEST_OWNED_DOMAIN_CONSTANT_MESSAGE_ID }],
      },
      {
        name: "GIVEN top-level as const object registry WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.objectRegistry,
        filename: VALIDATION_ESLINT_FILES.supportFile,
        errors: [{ messageId: TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID }],
      },
      {
        name: "GIVEN top-level as const tuple registry WHEN linting THEN error",
        code: VALIDATION_ESLINT_SNIPPETS.tupleRegistry,
        filename: VALIDATION_ESLINT_FILES.sourceOwnedSpecTest,
        errors: [{ messageId: TEST_OWNED_DOMAIN_REGISTRY_MESSAGE_ID }],
      },
    ],
  };
}

export function noHardcodedStatusesCases(): ValidationGeneratedRuleTesterCases {
  const done = WORK_ITEM_STATUSES.find((status) => status === "DONE") ?? WORK_ITEM_STATUSES[0];
  const inProgress = WORK_ITEM_STATUSES.find((status) => status === "IN_PROGRESS") ?? WORK_ITEM_STATUSES[0];
  const open = WORK_ITEM_STATUSES.find((status) => status === "OPEN") ?? WORK_ITEM_STATUSES[0];
  return {
    valid: [
      {
        name: "GIVEN expect with imported WORK_ITEM_STATUSES registry WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.sourceOwnedStatuses,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN type alias with status literal WHEN linting THEN no error",
        code: `type Status = "${done}"`,
        filename: "types.ts",
      },
      {
        name: "GIVEN registry-derived status type WHEN linting THEN no error",
        code: `type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]`,
        filename: VALIDATION_ESLINT_FILES.sourceTypes,
      },
      {
        name: "GIVEN non-test file with status literal WHEN linting THEN no error",
        code: `const status = "${done}"`,
        filename: VALIDATION_ESLINT_FILES.sourceStatus,
      },
      {
        name: "GIVEN production code with status comparison WHEN linting THEN no error",
        code: `function check() { if (item.status === "${inProgress}") { return true; } }`,
        filename: VALIDATION_ESLINT_FILES.sourceScannerWalk,
      },
      {
        name: "GIVEN object with status as key WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.statusObjectKeys,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN partial match DONE.md WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.donePathAssertion,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN partial match tests DONE.md WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.nestedDonePathAssertion,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
    ],
    invalid: [
      ...[done, inProgress, open].map((status) => ({
        name: `GIVEN expect().toBe(${status}) WHEN linting THEN error`,
        code: `expect(item.status).toBe("${status}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      })),
      {
        name: "GIVEN expect().toEqual status WHEN linting THEN error",
        code: `expect(status).toEqual("${done}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN expect().toMatchObject with status property WHEN linting THEN error",
        code: `expect(result).toMatchObject({ status: "${inProgress}" })`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN expect().toContain status WHEN linting THEN error",
        code: `expect(statuses).toContain("${open}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN nested object with status literal WHEN linting THEN error",
        code: `expect(tree.node).toMatchObject({ item: { status: "${done}" } })`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN multiple hardcoded statuses WHEN linting THEN multiple errors",
        code: `expect(a.status).toBe("${open}"); expect(b.status).toBe("${done}");`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [
          { messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID },
          { messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID },
        ],
      },
      {
        name: "GIVEN spec file with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("${done}")`,
        filename: VALIDATION_ESLINT_FILES.genericSpec,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN file in tests directory with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("${inProgress}")`,
        filename: VALIDATION_ESLINT_FILES.nestedTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
      {
        name: "GIVEN file in __tests__ directory with hardcoded status WHEN linting THEN error",
        code: `expect(item.status).toBe("${open}")`,
        filename: VALIDATION_ESLINT_FILES.doubleUnderscoreTest,
        errors: [{ messageId: USE_WORK_ITEM_STATUSES_MESSAGE_ID }],
      },
    ],
  };
}

export function noHardcodedWorkItemKindsCases(): ValidationGeneratedRuleTesterCases {
  const story = WORK_ITEM_KINDS.find((kind) => kind === "story") ?? WORK_ITEM_KINDS[0];
  const feature = WORK_ITEM_KINDS.find((kind) => kind === "feature") ?? WORK_ITEM_KINDS[0];
  const capability = WORK_ITEM_KINDS.find((kind) => kind === "capability") ?? WORK_ITEM_KINDS[0];
  return {
    valid: [
      {
        name: "GIVEN expect with imported WORK_ITEM_KINDS registry WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.sourceOwnedKinds,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN expect with LEAF_KIND constant WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.sourceOwnedLeafKind,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN type alias with kind literal WHEN linting THEN no error",
        code: `type Kind = "${story}"`,
        filename: "types.ts",
      },
      {
        name: "GIVEN registry-derived kind type WHEN linting THEN no error",
        code: `type WorkItemKind = (typeof WORK_ITEM_KINDS)[number]`,
        filename: VALIDATION_ESLINT_FILES.sourceTypes,
      },
      {
        name: "GIVEN non-test file with kind literal WHEN linting THEN no error",
        code: `const kind = "${story}"`,
        filename: VALIDATION_ESLINT_FILES.sourceParser,
      },
      {
        name: "GIVEN production code with kind assignment WHEN linting THEN no error",
        code: `function check() { if (item.kind === "${feature}") { return true; } }`,
        filename: VALIDATION_ESLINT_FILES.sourceScannerWalk,
      },
      {
        name: "GIVEN regex pattern with kind string WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.kindRegex,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
      {
        name: "GIVEN object with kind as key WHEN linting THEN no error",
        code: VALIDATION_ESLINT_SNIPPETS.kindObjectKeys,
        filename: VALIDATION_ESLINT_FILES.genericTest,
      },
    ],
    invalid: [
      ...[story, feature, capability].map((kind) => ({
        name: `GIVEN expect().toBe(${kind}) WHEN linting THEN error`,
        code: `expect(item.kind).toBe("${kind}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      })),
      {
        name: "GIVEN expect().toEqual kind WHEN linting THEN error",
        code: `expect(kind).toEqual("${feature}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN expect().toMatchObject with kind property WHEN linting THEN error",
        code: `expect(result).toMatchObject({ kind: "${capability}" })`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN expect().toContain kind WHEN linting THEN error",
        code: `expect(kinds).toContain("${story}")`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN nested object with kind literal WHEN linting THEN error",
        code: `expect(tree.children[0]).toMatchObject({ item: { kind: "${feature}" } })`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN multiple hardcoded kinds WHEN linting THEN multiple errors",
        code: `expect(a.kind).toBe("${story}"); expect(b.kind).toBe("${feature}");`,
        filename: VALIDATION_ESLINT_FILES.genericTest,
        errors: [
          { messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID },
          { messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID },
        ],
      },
      {
        name: "GIVEN spec file with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("${story}")`,
        filename: VALIDATION_ESLINT_FILES.kindSpec,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN file in tests directory with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("${capability}")`,
        filename: VALIDATION_ESLINT_FILES.nestedScannerTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
      {
        name: "GIVEN file in __tests__ directory with hardcoded kind WHEN linting THEN error",
        code: `expect(item.kind).toBe("${feature}")`,
        filename: VALIDATION_ESLINT_FILES.doubleUnderscoreParserTest,
        errors: [{ messageId: USE_WORK_ITEM_KINDS_MESSAGE_ID }],
      },
    ],
  };
}

export function astRestrictedSyntaxRuns(): ValidationGeneratedRuleTesterRun[] {
  return [
    {
      title: "enum declarations map to a restricted syntax error",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "const Direction = { Up: 'up', Down: 'down' } as const;",
            options: tsRestrictedSyntax,
          },
        ],
        invalid: [
          {
            code: "enum Direction { Up, Down }",
            options: tsRestrictedSyntax,
            errors: [{ message: tsRestrictedSyntax[FIRST_RULE_INDEX].message }],
          },
        ],
      },
    },
    {
      title: "as any assertions map to a restricted syntax error",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "const x = value as unknown;",
            options: tsRestrictedSyntax,
          },
        ],
        invalid: [
          {
            code: "const x = value as any;",
            options: tsRestrictedSyntax,
            errors: [{ message: tsRestrictedSyntax[SECOND_RULE_INDEX].message }],
          },
        ],
      },
    },
    {
      title: "angle any assertions map to a restricted syntax error",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "const x = value as unknown;",
            options: tsRestrictedSyntax,
          },
        ],
        invalid: [
          {
            code: "const x = <any>value;",
            options: tsRestrictedSyntax,
            errors: [{ message: tsRestrictedSyntax[THIRD_RULE_INDEX].message }],
          },
        ],
      },
    },
    {
      title: "mocking helpers map to test restricted syntax errors",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "const deps = { fetch: async () => new Response() };",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
          },
          {
            code: "const stub = { call: async () => ({ ok: true }) };",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
          },
        ],
        invalid: [
          {
            code: "vi.mock(\"../src/database\");",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            errors: [{ message: testRestrictedSyntax[FIRST_RULE_INDEX].message }],
          },
          {
            code: "const fn = vi.fn();",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            errors: [{ message: testRestrictedSyntax[SECOND_RULE_INDEX].message }],
          },
        ],
      },
    },
    {
      title: "skip and source reads map to test restricted syntax errors",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "it('always runs', () => { expect(true).toBe(true); });",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
          },
          {
            code: "import { resolve } from 'node:path';",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
          },
        ],
        invalid: [
          {
            code: "it.skipIf(process.env.CI)('skipped', () => {});",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            errors: [{ message: testRestrictedSyntax[FOURTH_RULE_INDEX].message }],
          },
          {
            code: "import { readFileSync } from 'node:fs';",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            errors: [{ message: testRestrictedSyntax[FIFTH_RULE_INDEX].message }],
          },
        ],
      },
    },
    {
      title: "assertion string literals map to test restricted syntax errors",
      ruleName: NO_RESTRICTED_SYNTAX_RULE_ID,
      cases: {
        valid: [
          {
            code: "expect(typeof value).toBe(\"string\");",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
          },
        ],
        invalid: [
          {
            code: "expect(name).toBe(\"alice\");",
            options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            errors: [{ message: testRestrictedSyntax[THIRD_RULE_INDEX].message }],
          },
        ],
      },
    },
  ];
}

export function astBareStringUnionRun(): ValidationGeneratedRuleTesterRun {
  return {
    title: "bare string unions map to a custom rule error",
    ruleName: NO_BARE_STRING_UNIONS_RULE_NAME,
    cases: {
      valid: [
        "const Tier = { Free: 'free', Pro: 'pro' } as const; type Tier = (typeof Tier)[keyof typeof Tier];",
        "type Mode = 'read';",
        "type Mixed = 'read' | 2;",
      ],
      invalid: [
        {
          code: "type Tier = 'free' | 'pro';",
          errors: [{ messageId: BARE_STRING_UNION_MESSAGE_ID }],
        },
        {
          code: "interface Config { mode: 'strict' | 'lenient'; }",
          errors: [{ messageId: BARE_STRING_UNION_MESSAGE_ID }],
        },
      ],
    },
  };
}

export function astImportSourceExtensionRun(): ValidationGeneratedRuleTesterRun {
  return {
    title: "internal import source extensions map to import hygiene errors",
    ruleName: NO_IMPORT_SOURCE_EXTENSIONS_RULE_NAME,
    cases: {
      valid: [
        "import { parse } from './parser';",
        "import type { Config } from '@/config/types';",
        "export { parse } from '@scripts/run/validate';",
        "const mod = import('@eslint-rules/no-spec-references');",
        "import external from 'published-package/index.js';",
      ],
      invalid: [
        {
          code: "import { parse } from './parser.js';",
          output: "import { parse } from './parser';",
          errors: [{ messageId: IMPORT_SOURCE_EXTENSION_MESSAGE_ID }],
        },
        {
          code: "export { parse } from '@/scanner/patterns.ts';",
          output: "export { parse } from '@/scanner/patterns';",
          errors: [{ messageId: IMPORT_SOURCE_EXTENSION_MESSAGE_ID }],
        },
        {
          code: "const mod = import('@testing/harnesses/constants.mjs');",
          output: "const mod = import('@testing/harnesses/constants');",
          errors: [{ messageId: IMPORT_SOURCE_EXTENSION_MESSAGE_ID }],
        },
      ],
    },
  };
}

export function astDeepRelativeImportRun(): ValidationGeneratedRuleTesterRun {
  return {
    title: "deep relative imports map to import hygiene errors",
    ruleName: NO_DEEP_RELATIVE_IMPORTS_RULE_NAME,
    cases: {
      valid: [
        "import { parse } from './parser';",
        "import { parse } from '../parser';",
        "import { parse } from '@/scanner/patterns';",
        "const mod = import('@scripts/run/validate');",
      ],
      invalid: [
        {
          code: "import { parse } from '../../scanner/patterns';",
          errors: [{ messageId: DEEP_RELATIVE_IMPORT_MESSAGE_ID }],
        },
        {
          code: "export { parse } from '../../../scanner/patterns';",
          errors: [{ messageId: DEEP_RELATIVE_IMPORT_MESSAGE_ID }],
        },
      ],
    },
  };
}

export function astNoSpecReferencesRuns(): ValidationGeneratedRuleTesterRun[] {
  return [
    {
      title: "non-spec text is accepted by the spec reference rule",
      ruleName: NO_SPEC_REFERENCES_RULE_NAME,
      cases: {
        valid: [
          { code: "const name = \"authentication module\";" },
          { code: "const desc = \"handles data retrieval\";" },
          { code: "const version = `v2.0.0`;" },
          {
            code: "const PATTERN = /ADR-15/;",
            filename: VALIDATION_ESLINT_FILES.noSpecReferencesRuleFile,
          },
        ],
        invalid: [],
      },
    },
    {
      title: "spec reference text is rejected by the spec reference rule",
      ruleName: NO_SPEC_REFERENCES_RULE_NAME,
      cases: {
        valid: [],
        invalid: [
          {
            code: "const ref = \"See ADR-21 for details\";",
            errors: [{ messageId: SPEC_REFERENCE_MESSAGE_ID }],
          },
          {
            code: "const ref = \"Per PDR-15\";",
            errors: [{ messageId: SPEC_REFERENCE_MESSAGE_ID }],
          },
          {
            code: "const ref = \"ADR 21 compliance\";",
            errors: [{ messageId: SPEC_REFERENCE_MESSAGE_ID }],
          },
          {
            code: "const msg = `Per ADR-32 requirements`;",
            errors: [{ messageId: SPEC_REFERENCE_MESSAGE_ID }],
          },
        ],
      },
    },
  ];
}

export function astBddTryCatchRuns(): ValidationGeneratedRuleTesterRun[] {
  return [
    {
      title: "rethrowing or assertion-free try-catch is accepted",
      ruleName: NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_NAME,
      cases: {
        valid: [
          "try { expect(x).toBe(y); } catch (e) { throw e; }",
          "try { doSomething(); } catch (e) { console.log(e); }",
        ],
        invalid: [],
      },
    },
    {
      title: "swallowed assertions in try-catch are rejected",
      ruleName: NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_NAME,
      cases: {
        valid: [],
        invalid: [
          {
            code: "try { expect(x).toBe(y); } catch (e) {}",
            errors: [{ messageId: EMPTY_SWALLOWING_MESSAGE_ID }],
          },
          {
            code: "try { expect(x).toBe(y); } catch (e) { console.log(\"swallowed\"); }",
            errors: [{ messageId: HIDDEN_ASSERTIONS_MESSAGE_ID }],
          },
        ],
      },
    },
  ];
}

export const VALIDATION_ESLINT_RULE_IDS = {
  bareStringUnions: NO_BARE_STRING_UNIONS_RULE_ID,
  bddTryCatch: NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_ID,
  deepRelativeImports: NO_DEEP_RELATIVE_IMPORTS_RULE_ID,
  hardcodedStatuses: NO_HARDCODED_STATUSES_RULE_ID,
  hardcodedWorkItemKinds: NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID,
  importSourceExtensions: NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID,
  noRestrictedSyntax: NO_RESTRICTED_SYNTAX_RULE_ID,
  noSpecReferences: NO_SPEC_REFERENCES_RULE_ID,
  noTestOwnedDomainConstants: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
  registryPositionAccess: NO_REGISTRY_POSITION_ACCESS_RULE_ID,
} as const;

export const VALIDATION_PIPELINE_STAGE_NAMES = VALIDATION_STAGE_DISPLAY_NAMES;

export function validationRuleRegistrationCases(): ValidationGeneratedRuleRegistrationCase[] {
  return [
    {
      title: "bdd rule is registered",
      filePath: validationTestFilePath(),
      ruleIds: [NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_ID],
    },
    {
      title: "work item domain rules are registered",
      filePath: validationTestFilePath(),
      ruleIds: [NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID, NO_HARDCODED_STATUSES_RULE_ID],
    },
    {
      title: "test-owned constant rule is registered for spec tests",
      filePath: VALIDATION_ESLINT_FILES.unmanifestedSpecTest,
      ruleIds: [NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID],
    },
    {
      title: "registry position rule is registered",
      filePath: validationTestFilePath(),
      ruleIds: [NO_REGISTRY_POSITION_ACCESS_RULE_ID],
    },
    {
      title: "import hygiene rules are registered",
      filePath: validationSourceFilePath(),
      ruleIds: [
        NO_BARE_STRING_UNIONS_RULE_ID,
        NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID,
        NO_DEEP_RELATIVE_IMPORTS_RULE_ID,
      ],
    },
    {
      title: "spec reference rule is registered",
      filePath: validationSourceFilePath(),
      ruleIds: [NO_SPEC_REFERENCES_RULE_ID],
    },
    {
      title: "restricted syntax rule is registered",
      filePath: validationSourceFilePath(),
      ruleIds: [NO_RESTRICTED_SYNTAX_RULE_ID],
    },
  ];
}

export function validationConfigSeverityScenarios(): ValidationGeneratedConfigSeverityScenario[] {
  return [
    {
      title: "debt manifest downgrades only the test-owned constant rule",
      filePath: VALIDATION_ESLINT_FILES.manifestCoveredSpecTest,
      expectations: [
        {
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          severity: VALIDATION_ESLINT_EXPECTED.warningSeverity,
        },
        {
          ruleId: NO_HARDCODED_STATUSES_RULE_ID,
          severity: VALIDATION_ESLINT_EXPECTED.errorSeverity,
        },
      ],
    },
  ];
}

export function validationLintScenarios(): ValidationGeneratedLintScenario[] {
  const done = WORK_ITEM_STATUSES.find((status) => status === "DONE") ?? WORK_ITEM_STATUSES[0];
  const story = WORK_ITEM_KINDS.find((kind) => kind === "story") ?? WORK_ITEM_KINDS[0];

  return [
    {
      title: "bare string union is reported",
      code: VALIDATION_ESLINT_SNIPPETS.bareStringUnion,
      filePath: validationSourceFilePath(),
      expectations: [
        {
          ruleId: NO_BARE_STRING_UNIONS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "internal source extension is reported",
      code: VALIDATION_ESLINT_SNIPPETS.internalSourceExtension,
      filePath: validationSourceFilePath(),
      expectations: [
        {
          ruleId: NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "deep parent import is reported",
      code: VALIDATION_ESLINT_SNIPPETS.deepParentImport,
      filePath: VALIDATION_ESLINT_FILES.sessionCommandExample,
      expectations: [
        {
          ruleId: NO_DEEP_RELATIVE_IMPORTS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "hardcoded work item kind in a test file is reported",
      code: `expect(item.kind).toBe("${story}");`,
      filePath: validationTestFilePath(),
      expectations: [
        {
          ruleId: NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "hardcoded work item kind in source is ignored",
      code: `const kind = "${story}";`,
      filePath: VALIDATION_ESLINT_FILES.sourceParser,
      expectations: [
        {
          ruleId: NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.zeroDiagnostics,
        },
      ],
    },
    {
      title: "hardcoded status in a test file is reported",
      code: `expect(item.status).toBe("${done}");`,
      filePath: validationTestFilePath(),
      expectations: [
        {
          ruleId: NO_HARDCODED_STATUSES_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "hardcoded status in source is ignored",
      code: `const status = "${done}";`,
      filePath: VALIDATION_ESLINT_FILES.sourceStatus,
      expectations: [
        {
          ruleId: NO_HARDCODED_STATUSES_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.zeroDiagnostics,
        },
      ],
    },
    {
      title: "status token inside a markdown path is ignored",
      code: VALIDATION_ESLINT_SNIPPETS.nestedDonePathAssertion,
      filePath: validationTestFilePath(),
      expectations: [
        {
          ruleId: NO_HARDCODED_STATUSES_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.zeroDiagnostics,
        },
      ],
    },
    {
      title: "unmanifested test-owned domain constant is reported as an error",
      code: VALIDATION_ESLINT_SNIPPETS.testOwnedConstantDeclaration,
      filePath: VALIDATION_ESLINT_FILES.unmanifestedSpecTest,
      expectations: [
        {
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
          severity: VALIDATION_ESLINT_EXPECTED.errorSeverity,
        },
      ],
    },
    {
      title: "manifested test-owned domain constant is reported as a warning",
      code: VALIDATION_ESLINT_SNIPPETS.testOwnedConstantDeclaration,
      filePath: VALIDATION_ESLINT_FILES.manifestCoveredSpecTest,
      expectations: [
        {
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
          severity: VALIDATION_ESLINT_EXPECTED.warningSeverity,
        },
      ],
    },
    {
      title: "registry position access is reported",
      code: VALIDATION_ESLINT_SNIPPETS.decisionKindsPosition,
      filePath: validationTestFilePath(),
      expectations: [
        {
          ruleId: NO_REGISTRY_POSITION_ACCESS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
    {
      title: "source-owned domain constants are accepted",
      code: VALIDATION_ESLINT_SNIPPETS.sourceOwnedKinds,
      filePath: VALIDATION_ESLINT_FILES.sourceOwnedSpecTest,
      expectations: [
        {
          ruleId: NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.zeroDiagnostics,
        },
      ],
    },
    {
      title: "kind and status violations are reported together",
      code: VALIDATION_ESLINT_SNIPPETS.crossKindStatusAssertions,
      filePath: validationTestFilePath(),
      expectations: [
        {
          ruleId: NO_HARDCODED_WORK_ITEM_KINDS_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
        {
          ruleId: NO_HARDCODED_STATUSES_RULE_ID,
          count: VALIDATION_ESLINT_EXPECTED.singleDiagnostic,
        },
      ],
    },
  ];
}
