import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import { readFileSync } from "fs";
import globals from "globals";
import * as JSONC from "jsonc-parser";
import tseslint from "typescript-eslint";

// Import custom rules and restricted syntax selectors
import customRules from "./eslint-rules";
import { testRestrictedSyntax, tsRestrictedSyntax } from "./eslint-rules/restricted-syntax";

/**
 * Read TypeScript exclusions to maintain perfect scope alignment
 */
function getTypeScriptExclusions(configFile: string): string[] {
  try {
    const configContent = readFileSync(configFile, "utf-8");
    const config = JSONC.parse(configContent);
    return config.exclude || [];
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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // Allow unimported test utilities and transformers
      "no-undef": "off",
      "@typescript-eslint/no-redeclare": "off",
      // Ban vi.mock(), vi.fn(), string literals in assertions, skipIf, readFileSync
      // Set to "warn" until existing violations are resolved
      "no-restricted-syntax": [
        "warn",
        ...tsRestrictedSyntax,
        ...testRestrictedSyntax,
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
      // Set to "warn" until existing violations are resolved
      "spx/no-spec-references": "warn",
    },
  },
  // Custom CraftFinal rules for test files
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.ts", "**/__tests__/**/*.ts"],
    plugins: {
      spx: customRules,
    },
    rules: {
      "spx/no-bdd-try-catch-anti-pattern": "error",
      // Rules set to "warn" until existing violations are fixed (463 violations detected)
      // See feature-25_eslint-rules-enforcement for tracking
      "spx/no-hardcoded-work-item-kinds": "warn",
      "spx/no-hardcoded-statuses": "warn",
    },
  },

  // Prettier integration (must be last)
  prettier,
];

export default config;
