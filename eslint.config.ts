import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import { readFileSync } from "node:fs";
import tseslint from "typescript-eslint";

// Import custom rules and restricted syntax selectors
import customRules from "./eslint-rules";
import { NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_ID } from "./eslint-rules/no-async-spawn-outside-lifecycle";
import { NO_BARE_STRING_UNIONS_RULE_ID } from "./eslint-rules/no-bare-string-unions";
import { NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_ID } from "./eslint-rules/no-bdd-try-catch-anti-pattern";
import { NO_DEEP_RELATIVE_IMPORTS_RULE_ID } from "./eslint-rules/no-deep-relative-imports";
import { NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_ID } from "./eslint-rules/no-hardcoded-session-frontmatter-keys";
import { NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_ID } from "./eslint-rules/no-hardcoded-spec-tree-node-kinds";
import { NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_ID } from "./eslint-rules/no-hardcoded-spec-tree-node-states";
import { NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID } from "./eslint-rules/no-import-source-extensions";
import { NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_ID } from "./eslint-rules/no-process-cwd-for-product-roots";
import { NO_REGISTRY_POSITION_ACCESS_RULE_ID } from "./eslint-rules/no-registry-position-access";
import { NO_SPEC_REFERENCES_RULE_ID } from "./eslint-rules/no-spec-references";
import { NO_TASK_MARKER_COMMENTS_RULE_ID } from "./eslint-rules/no-task-marker-comments";
import { NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID } from "./eslint-rules/no-test-owned-domain-constants";
import {
  MIRROR_RULES,
  TASK_MARKER_COMMENT_FALLBACK_FILES,
  TYPE_AWARE_PARSER_OPTIONS,
} from "./eslint-rules/offline-mirror";
import {
  TEST_READ_FILE_SYNC_IMPORT_RULE,
  testRestrictedSyntax,
  tsRestrictedSyntax,
} from "./eslint-rules/restricted-syntax";
import { readTypeScriptExcludeGlobs } from "./src/validation/eslint-config-exclusions";
import { LINT_POLICY_MANIFESTS, parseLintPolicyManifest } from "./src/validation/lint-policy-constants";

const TEST_LINT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_LINT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.file;
const TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.key;
export const ESLINT_TYPESCRIPT_CONFIG_FILES = {
  FULL: "./tsconfig.json",
  PRODUCTION: "./tsconfig.production.json",
} as const;

export interface BuildEslintConfigOptions {
  readonly typescriptConfigFile?: string;
}

function readManifest(file: string, key: string): string[] {
  return parseLintPolicyManifest(
    readFileSync(file, "utf-8"),
    file,
    key,
  );
}

function toTestLintDebtNodeTestGlob(path: string): string {
  // Legacy lint debt predates alternate test suffix support and tracks only
  // canonical `.test.ts` files under each listed node.
  return `${path}/**/*.test.ts`;
}

function toTestOwnedConstantDebtNodeTestGlobs(path: string): readonly string[] {
  return [
    `${path}/**/*.test.ts`,
    `${path}/**/*.spec.ts`,
    `${path}/**/tests/**/*.ts`,
    `${path}/**/__tests__/**/*.ts`,
  ];
}

function isLegacyLintNoiseRule(
  rule: (typeof testRestrictedSyntax)[number],
): boolean {
  return (
    rule === TEST_READ_FILE_SYNC_IMPORT_RULE
  );
}

const testLintDebtNodePaths = readManifest(
  TEST_LINT_DEBT_NODE_MANIFEST_FILE,
  TEST_LINT_DEBT_NODE_MANIFEST_KEY,
);
const testOwnedConstantDebtNodePaths = readManifest(
  TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE,
  TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_KEY,
);
const testLintDebtNodeTestGlobs = testLintDebtNodePaths.map(toTestLintDebtNodeTestGlob);
const testOwnedConstantDebtNodeTestGlobs = testOwnedConstantDebtNodePaths.flatMap(
  toTestOwnedConstantDebtNodeTestGlobs,
);
const testLintDebtRestrictedSyntax = testRestrictedSyntax.filter(
  (rule) => !isLegacyLintNoiseRule(rule),
);

export function buildEslintConfig(options: BuildEslintConfigOptions = {}) {
  const typescriptConfigFile = options.typescriptConfigFile ?? ESLINT_TYPESCRIPT_CONFIG_FILES.FULL;
  const tsExclusionGlobs = readTypeScriptExcludeGlobs(typescriptConfigFile);

  return [
    // Ignore patterns - tsconfig.json exclusions + ESLint-specific patterns
    {
      ignores: [
        // Add ESLint-specific ignore rules below only if they cannot be
        // handled in tsconfig.json

        // From tsconfig.json (single source of truth)
        ...tsExclusionGlobs,
      ],
    },

    // Base configuration for all files
    {
      plugins: {
        import: importPlugin,
      },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parser: tseslint.parser,
        globals: {
          ...globals.node,
          ...globals.es2021,
        },
      },
    },

    // JavaScript recommended rules
    js.configs.recommended,

    // TypeScript configuration
    {
      files: ["**/*.ts", "**/*.tsx"],
      plugins: {
        "@typescript-eslint": tseslint.plugin,
      },
      languageOptions: {
        parser: tseslint.parser,
      },
      rules: {
        ...tseslint.configs.recommended[2].rules,
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        // Disable rules that conflict with TypeScript compiler
        "no-unreachable": "off",
        "no-redeclare": "off",
        "no-undef": "off", // TypeScript handles this better
        "no-dupe-class-members": "off",
        // Enable TypeScript-specific versions
        "@typescript-eslint/no-redeclare": "error",
        // Ban enums, "as any", "<any>" assertions
        "no-restricted-syntax": ["error", ...tsRestrictedSyntax],
      },
    },

    // Type-aware lint mirror — the deterministic offline floor of code-quality
    // enforcement. Runs rules drawn from SonarJS, the type-aware
    // @typescript-eslint rules, ESLint core, eslint-plugin-import, the custom
    // spx plugin, and the unicorn-family modernization rules locally, at two
    // tiers: an error tier
    // for finding classes cleared from the tree and a warn tier for classes
    // whose backlog is uncleared. A backlog session flips a class to error as
    // its last occurrence clears.
    {
      // Scoped to the trees in tsconfig.json `include`, so the project service
      // resolves a project for every linted file. Root build-config files
      // (eslint.config.ts, vitest.config.ts, …) sit outside the project and are
      // left on syntax-only parsing.
      files: [
        "src/**/*.{ts,tsx}",
        "bin/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
        "testing/**/*.{ts,tsx}",
        "spx/**/*.{ts,tsx}",
      ],
      plugins: {
        "@typescript-eslint": tseslint.plugin,
        spx: customRules,
        sonarjs,
        unicorn,
        import: importPlugin,
      },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: TYPE_AWARE_PARSER_OPTIONS,
      },
      rules: MIRROR_RULES,
    },

    // ESLint config files and other script files
    {
      files: [".eslintrc.{js,cjs}", "eslint.config.js", "tailwind.config.ts"],
      languageOptions: {
        sourceType: "script",
        globals: {
          node: true,
        },
      },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },

    // TypeScript declaration files
    {
      files: ["**/*.d.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
      },
    },

    // Test files overrides
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      languageOptions: {
        globals: {
          // Test environment globals
          describe: "readonly",
          it: "readonly",
          expect: "readonly",
          beforeEach: "readonly",
          afterEach: "readonly",
          beforeAll: "readonly",
          afterAll: "readonly",
          vi: "readonly",
          vitest: "readonly",
          test: "readonly",
        },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unnecessary-condition": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        // Allow unimported test utilities and transformers
        "no-undef": "off",
        "@typescript-eslint/no-redeclare": "off",
        // Ban vi.mock(), vi.fn(), skipIf, and readFileSync
        "no-restricted-syntax": [
          "error",
          ...tsRestrictedSyntax,
          ...testRestrictedSyntax,
        ],
      },
    },
    ...(testLintDebtNodeTestGlobs.length === 0
      ? []
      : [{
        files: testLintDebtNodeTestGlobs,
        rules: {
          "no-restricted-syntax": [
            "error",
            ...tsRestrictedSyntax,
            ...testLintDebtRestrictedSyntax,
          ],
        },
      }]),

    // Custom rules — all TypeScript files
    {
      files: ["**/*.ts", "**/*.tsx"],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_ID]: "error",
        [NO_BARE_STRING_UNIONS_RULE_ID]: "error",
        [NO_DEEP_RELATIVE_IMPORTS_RULE_ID]: "error",
        [NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID]: "error",
        [NO_SPEC_REFERENCES_RULE_ID]: "error",
      },
    },
    {
      files: [...TASK_MARKER_COMMENT_FALLBACK_FILES],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_TASK_MARKER_COMMENTS_RULE_ID]: "error",
      },
    },
    {
      files: [
        "src/**/*.{ts,tsx}",
        "bin/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx}",
        "testing/generators/**/*.{ts,tsx}",
      ],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_PROCESS_CWD_FOR_PRODUCT_ROOTS_RULE_ID]: "error",
      },
    },
    {
      files: [
        "src/commands/session/**/*.ts",
        "src/domains/session/**/*.ts",
        "spx/36-session.enabler/**/*.ts",
        "testing/harnesses/session/**/*.ts",
      ],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_HARDCODED_SESSION_FRONTMATTER_KEYS_RULE_ID]: "error",
      },
    },
    // Custom rules for test files
    {
      files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.ts", "**/__tests__/**/*.ts"],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_BDD_TRY_CATCH_ANTI_PATTERN_RULE_ID]: "error",
        [NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_ID]: "error",
        [NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_ID]: "error",
        [NO_REGISTRY_POSITION_ACCESS_RULE_ID]: "error",
      },
    },
    {
      files: ["spx/**/*.test.ts", "spx/**/*.spec.ts", "spx/**/tests/**/*.ts", "spx/**/__tests__/**/*.ts"],
      plugins: {
        spx: customRules,
      },
      rules: {
        [NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID]: "error",
      },
    },
    ...(testLintDebtNodeTestGlobs.length === 0
      ? []
      : [{
        files: testLintDebtNodeTestGlobs,
        rules: {
          "@typescript-eslint/no-explicit-any": "off",
          [NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_ID]: "warn",
          [NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_ID]: "warn",
        },
      }]),
    ...(testOwnedConstantDebtNodeTestGlobs.length === 0
      ? []
      : [{
        files: testOwnedConstantDebtNodeTestGlobs,
        rules: {
          [NO_HARDCODED_SPEC_TREE_NODE_KINDS_RULE_ID]: "error",
          [NO_HARDCODED_SPEC_TREE_NODE_STATES_RULE_ID]: "error",
          [NO_TEST_OWNED_DOMAIN_CONSTANTS_RULE_ID]: "warn",
        },
      }]),
  ];
}

export default buildEslintConfig();
