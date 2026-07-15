import { describe as vitestDescribe, it as vitestIt } from "vitest";
export { expect } from "vitest";

import { VITEST_TEST_TIMEOUT } from "@testing/vitest-policy";

const SUITE_TITLE_SEPARATOR = " / ";
const CASE_VALUE_PLACEHOLDER = "%s";
export const HARNESS_TEST_CASE_TITLE_PATTERN = "$title";

export interface HarnessTestCase {
  readonly title: string;
  readonly run: () => Promise<void> | void;
  readonly timeout?: number;
}

let activeCollector: HarnessTestCase[] | undefined;
const suiteTitleStack: string[] = [];

interface HarnessIt {
  (title: string, run: () => Promise<void> | void, timeout?: number): void;
  each: <T>(testCases: readonly T[]) => (
    title: string,
    run: (testCase: T) => Promise<void> | void,
    timeout?: number,
  ) => void;
}

export function describe(title: string, body: () => void): void {
  if (activeCollector === undefined) {
    vitestDescribe(title, body);
    return;
  }

  suiteTitleStack.push(title);
  try {
    body();
  } finally {
    suiteTitleStack.pop();
  }
}

function registerHarnessTestCase(
  title: string,
  run: () => Promise<void> | void,
  timeout?: number,
): void {
  if (activeCollector === undefined) {
    if (timeout === undefined) {
      vitestIt(title, run);
      return;
    }
    vitestIt(title, run, timeout);
    return;
  }

  const fullTitle = [...suiteTitleStack, title].join(SUITE_TITLE_SEPARATOR);
  activeCollector.push(timeout === undefined ? { title: fullTitle, run } : { title: fullTitle, run, timeout });
}

function formatHarnessCaseValue(value: unknown): string {
  if (value === null) return JSON.stringify(value);
  if (value === undefined) return typeof value;
  if (typeof value === "string") return value;
  if (
    typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
    || typeof value === "symbol"
  ) {
    return value.toString();
  }
  return JSON.stringify(value);
}

function formatParameterizedTitle(title: string, value: unknown): string {
  return title.replace(CASE_VALUE_PLACEHOLDER, formatHarnessCaseValue(value));
}

function eachHarnessTestCase<T>(testCases: readonly T[]) {
  return (
    title: string,
    run: (testCase: T) => Promise<void> | void,
    timeout?: number,
  ): void => {
    if (activeCollector === undefined) {
      vitestIt.each([...testCases])(title, run, timeout);
      return;
    }

    for (const testCase of testCases) {
      registerHarnessTestCase(
        formatParameterizedTitle(title, testCase),
        () => run(testCase),
        timeout,
      );
    }
  };
}

export const it: HarnessIt = Object.assign(registerHarnessTestCase, {
  each: eachHarnessTestCase,
});

export function collectHarnessTestCases(registerTests: () => void): readonly HarnessTestCase[] {
  if (activeCollector !== undefined) {
    throw new Error("cannot collect harness test cases while another collection is active");
  }

  const collected: HarnessTestCase[] = [];
  activeCollector = collected;
  try {
    registerTests();
  } finally {
    activeCollector = undefined;
    suiteTitleStack.length = 0;
  }
  return collected;
}

export function registerHarnessTestCases(testCases: readonly HarnessTestCase[]): void {
  assertHarnessTestCasesPresent(testCases);
  for (const testCase of testCases) {
    registerHarnessTestCase(testCase.title, testCase.run, testCase.timeout);
  }
}

function assertHarnessTestCasesPresent(testCases: readonly HarnessTestCase[]): void {
  if (testCases.length === 0) {
    throw new Error("harness test collection registered no cases");
  }
}

function resolveHarnessTestCaseTimeout(testCase: HarnessTestCase): number {
  return testCase.timeout ?? VITEST_TEST_TIMEOUT;
}

export function prepareHarnessTestCases(testCases: readonly HarnessTestCase[]): readonly HarnessTestCase[] {
  assertHarnessTestCasesPresent(testCases);
  return testCases;
}

export function harnessTestCaseArguments(
  testCases: readonly HarnessTestCase[],
): readonly [string, (testCase: HarnessTestCase) => Promise<void>, number] {
  assertHarnessTestCasesPresent(testCases);
  return [
    HARNESS_TEST_CASE_TITLE_PATTERN,
    runHarnessTestCase,
    Math.max(...testCases.map(resolveHarnessTestCaseTimeout)),
  ];
}

export async function runHarnessTestCase(testCase: HarnessTestCase): Promise<void> {
  const timeout = resolveHarnessTestCaseTimeout(testCase);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(testCase.run),
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`harness test case timed out after ${timeout}ms`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
