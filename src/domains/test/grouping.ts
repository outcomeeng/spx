import type { TestingLanguageDescriptor } from "@/test/languages/types";

/** A registered language paired with the discovered test files it owns. */
export interface LanguageTestGroup {
  readonly language: TestingLanguageDescriptor;
  readonly testPaths: readonly string[];
}

/** Discovered test files partitioned by owning language, plus the files no language claims. */
export interface TestFileGrouping {
  readonly groups: readonly LanguageTestGroup[];
  readonly unmatched: readonly string[];
}

/**
 * Partitions discovered test files by the first registered language whose
 * `matchesTestFile` claims each file; files no language claims become
 * `unmatched`. Group order follows registry order, and only languages with at
 * least one matching file produce a group.
 */
export function groupTestFiles(
  testFiles: readonly string[],
  languages: readonly TestingLanguageDescriptor[],
): TestFileGrouping {
  const pathsByLanguage = new Map<TestingLanguageDescriptor, string[]>();
  const unmatched: string[] = [];

  for (const testFile of testFiles) {
    const language = languages.find((candidate) => candidate.matchesTestFile(testFile));
    if (language === undefined) {
      unmatched.push(testFile);
      continue;
    }
    const existing = pathsByLanguage.get(language);
    if (existing === undefined) {
      pathsByLanguage.set(language, [testFile]);
    } else {
      existing.push(testFile);
    }
  }

  const groups: LanguageTestGroup[] = languages
    .filter((language) => pathsByLanguage.has(language))
    .map((language) => ({ language, testPaths: pathsByLanguage.get(language) ?? [] }));

  return { groups, unmatched };
}
