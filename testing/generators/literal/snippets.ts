import * as fc from "fast-check";

import { DEFAULT_MIN_NUMBER_DIGITS, DEFAULT_MIN_STRING_LENGTH, WEB_PRESET_TOKENS } from "@/validation/literal/config";

const SOURCE_BINDING_NAME = "V";
const TEST_VARIABLE_NAME = "v";

const SNIPPET_STRING_MIN_LENGTH = DEFAULT_MIN_STRING_LENGTH * 2;
const SNIPPET_STRING_MAX_LENGTH = 32;
const SNIPPET_STRING_UNITS = "abcdefghijklmnopqrstuvwxyz-".split("");
const SNIPPET_WORD_SEPARATOR = "-";
const SNIPPET_NUMBER_MIN_DIGITS = DEFAULT_MIN_NUMBER_DIGITS + 1;
const SNIPPET_NUMBER_MAX_DIGITS = SNIPPET_NUMBER_MIN_DIGITS + 4;
const SNIPPET_SOURCE_DIRECTORY = "src";
const SNIPPET_TEST_DIRECTORY = "tests";
const SNIPPET_SOURCE_EXTENSION = ".ts";
const SNIPPET_TEST_EXTENSION = ".test.ts";
const RESERVED_SNIPPET_STRINGS: ReadonlySet<string> = new Set(WEB_PRESET_TOKENS);

export function buildStringDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + JSON.stringify(value) + ";\n";
}

export function buildNumericDeclaration(numStr: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + numStr + ";\n";
}

export function buildTemplateDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = `" + value + "`;\n";
}

export function buildStringAssertion(value: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + JSON.stringify(value) + ");\n";
}

export function buildNumericAssertion(numStr: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + numStr + ");\n";
}

/**
 * Strings the builders embed: lowercase letters joined by single inner hyphens, long enough for the
 * literal detector's default minimum string length, and outside the web preset tokens of the value allowlist.
 */
export function arbitrarySnippetString(): fc.Arbitrary<string> {
  return fc
    .string({
      unit: fc.constantFrom(...SNIPPET_STRING_UNITS),
      minLength: SNIPPET_STRING_MIN_LENGTH,
      maxLength: SNIPPET_STRING_MAX_LENGTH,
    })
    .filter((value) =>
      !value.startsWith(SNIPPET_WORD_SEPARATOR)
      && !value.endsWith(SNIPPET_WORD_SEPARATOR)
      && !value.includes(SNIPPET_WORD_SEPARATOR + SNIPPET_WORD_SEPARATOR)
      && !RESERVED_SNIPPET_STRINGS.has(value)
    );
}

/** Integers the numeric builders embed, with more digits than the literal detector's default minimum. */
export function arbitrarySnippetInteger(): fc.Arbitrary<number> {
  return fc.integer({
    min: 10 ** (SNIPPET_NUMBER_MIN_DIGITS - 1),
    max: 10 ** SNIPPET_NUMBER_MAX_DIGITS - 1,
  });
}

/** One string and one integer for the builders, with a source file and a test file to collect their output from. */
export type SnippetBuilderScenario = {
  readonly stringValue: string;
  readonly numericValue: string;
  readonly sourceFile: string;
  readonly testFile: string;
};

export function arbitrarySnippetBuilderScenario(): fc.Arbitrary<SnippetBuilderScenario> {
  return fc.record({
    stringValue: arbitrarySnippetString(),
    numericValue: arbitrarySnippetInteger().map(String),
    sourceFile: arbitrarySnippetString().map((name) =>
      `${SNIPPET_SOURCE_DIRECTORY}/${name}${SNIPPET_SOURCE_EXTENSION}`
    ),
    testFile: arbitrarySnippetString().map((name) => `${SNIPPET_TEST_DIRECTORY}/${name}${SNIPPET_TEST_EXTENSION}`),
  });
}
