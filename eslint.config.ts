import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import * as JSONC from "jsonc-parser";
import { readFileSync } from "node:fs";
import tseslint from "typescript-eslint";

// Import custom rules and restricted syntax selectors
import customRules from "./eslint-rules";
import { NO_BARE_STRING_UNIONS_RULE_ID } from "./eslint-rules/no-bare-string-unions";
import { NO_DEEP_RELATIVE_IMPORTS_RULE_ID } from "./eslint-rules/no-deep-relative-imports";
import { NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID } from "./eslint-rules/no-import-source-extensions";
import { testRestrictedSyntax, tsRestrictedSyntax } from "./eslint-rules/restricted-syntax";
import { LINT_POLICY_MANIFESTS } from "./src/validation/lint-policy-constants";

const TEST_LINT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_LINT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const ASSERTION_STRING_LITERAL_RULE_MESSAGE = "Do not use string literals in assertions.";
const READ_FILE_SYNC_IMPORT_RULE_MESSAGE = "readFileSync imports are banned in tests";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(content: string, source: string, key: string): string[] {
  const parsed = JSONC.parse(content) as unknown;

  if (!isJsonObject(parsed)) {
    throw new Error(`${source} must contain a JSON object`);
  }

  const entries = parsed[key];

  if (!Array.isArray(entries)) {
    throw new Error(`${source} must contain a ${key} array`);
  }

  const invalidEntries = entries.filter((entry) => typeof entry !== "string");

  if (invalidEntries.length > 0) {
    throw new Error(`${source} ${key} entries must be strings`);
  }

  return entries as string[];
}

function readManifest(file: string, key: string): string[] {
  return parseManifest(
    readFileSync(file, "utf-8"),
    file,
    key,
  );
}

function toTestLintDebtNodeTestGlob(path: string): string {
  return `${path}/**/*.test.ts`;
}

function isAssertionStringLiteralRule(
  rule: (typeof testRestrictedSyntax)[number],
): boolean {
  return rule.message.startsWith(ASSERTION_STRING_LITERAL_RULE_MESSAGE);
}

function isLegacyLintNoiseRule(
  rule: (typeof testRestrictedSyntax)[number],
): boolean {
  return (
    isAssertionStringLiteralRule(rule)
    || rule.message.startsWith(READ_FILE_SYNC_IMPORT_RULE_MESSAGE)
  );
}

/**
 * Read TypeScript exclusions to maintain perfect scope alignment.
 * Follows `extends` so derived configs (e.g. tsconfig.production.json)
 * inherit base exclusions such as `dist`.
 */
function getTypeScriptExclusions(configFile: string): string[] {
  try {
    const configContent = readFileSync(configFile, "utf-8");
    const config = JSONC.parse(configContent);
    const ownExcludes: string[] = config.exclude || [];
    if (config.extends) {
      const baseFile = config.extends.startsWith(".") ? config.extends : `./${config.extends}`;
      return [...getTypeScriptExclusions(baseFile), ...ownExcludes];
    }
    return ownExcludes;
  } catch {
    console.warn(`Could not read TypeScript config ${configFile}, using default exclusions`);
    return [];
  }
}

// Determine TypeScript config file based on mode
// Use ESLINT_PRODUCTION_ONLY=1 to lint only production files
const isBuildOnly = process.env.ESLINT_PRODUCTION_ONLY === "1";
const typescriptConfigFile = isBuildOnly ? "./tsconfig.production.json" : "./tsconfig.json";
// Always read TypeScript exclusions - tsconfig.json is the single source of truth
const tsExclusions = getTypeScriptExclusions(typescriptConfigFile);
const testLintDebtNodePaths = readManifest(
  TEST_LINT_DEBT_NODE_MANIFEST_FILE,
  TEST_LINT_DEBT_NODE_MANIFEST_KEY,
);
const testLintDebtNodeTestGlobs = testLintDebtNodePaths.map(toTestLintDebtNodeTestGlob);
const testLintDebtRestrictedSyntax = testRestrictedSyntax.filter(
  (rule) => !isLegacyLintNoiseRule(rule),
);

const config = [
  // Ignore patterns - tsconfig.json exclusions + ESLint-specific patterns
  {
    ignores: [
      // Add ESLint-specific ignore rules below only if they cannot be
      // handled in tsconfig.json

      // From tsconfig.json (single source of truth)
      ...tsExclusions.map((p) => (p.includes("*") ? p : `${p}/**/*`)),
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
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: typescriptConfigFile,
        },
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
      // Ban vi.mock(), vi.fn(), string literals in assertions, skipIf, readFileSync
      "no-restricted-syntax": [
        "error",
        ...tsRestrictedSyntax,
        ...testRestrictedSyntax,
      ],
    },
  },
  {
    files: testLintDebtNodeTestGlobs,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...tsRestrictedSyntax,
        ...testLintDebtRestrictedSyntax,
      ],
    },
  },

  // Custom rules — all TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      spx: customRules,
    },
    rules: {
      [NO_BARE_STRING_UNIONS_RULE_ID]: "error",
      [NO_DEEP_RELATIVE_IMPORTS_RULE_ID]: "error",
      [NO_IMPORT_SOURCE_EXTENSIONS_RULE_ID]: "error",
      "spx/no-spec-references": "error",
    },
  },
  // Custom rules for test files
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.ts", "**/__tests__/**/*.ts"],
    plugins: {
      spx: customRules,
    },
    rules: {
      "spx/no-bdd-try-catch-anti-pattern": "error",
      "spx/no-hardcoded-work-item-kinds": "error",
      "spx/no-hardcoded-statuses": "error",
    },
  },
  {
    files: testLintDebtNodeTestGlobs,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "spx/no-hardcoded-work-item-kinds": "warn",
      "spx/no-hardcoded-statuses": "warn",
    },
  },

  // Prettier integration (must be last)
  prettier,
];

export default config;
