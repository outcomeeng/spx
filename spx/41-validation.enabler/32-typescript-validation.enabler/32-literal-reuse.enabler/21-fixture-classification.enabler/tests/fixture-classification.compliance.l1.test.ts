import { describe, expect, it } from "vitest";

import { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/domains/spec/fixture-writer-methods";
import { FIXTURE_WRITER_CALLS } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitrarySpecTreeTestFilePath,
  arbitraryTestMarkerFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

import { collectFromFile } from "./support";

describe("ALWAYS: test-file classification recognizes POSIX /tests/, Windows \\tests\\, and .test. filename markers as test fixture paths", () => {
  it("a POSIX /tests/ path segment suppresses fixture-data variable contents", () => {
    const posixTestPath = sampleLiteralTestValue(arbitrarySpecTreeTestFilePath());
    const fixtureValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `const json = "${fixtureValue}";`;

    const values = collectFromFile(source, posixTestPath).map((o) => o.value);

    expect(values).not.toContain(fixtureValue);
  });

  it("a Windows \\tests\\ path segment suppresses fixture-data variable contents", () => {
    const slug = sampleLiteralTestValue(arbitraryDomainLiteral());
    const windowsTestPath = `spx\\${slug}\\tests\\scenario.l1.test.ts`;
    const fixtureValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `const json = "${fixtureValue}";`;

    const values = collectFromFile(source, windowsTestPath).map((o) => o.value);

    expect(values).not.toContain(fixtureValue);
  });

  it("a .test. filename marker suppresses fixture-data variable contents outside a tests directory", () => {
    const testMarkerPath = sampleLiteralTestValue(arbitraryTestMarkerFilePath());
    const fixtureValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `const json = "${fixtureValue}";`;

    const values = collectFromFile(source, testMarkerPath).map((o) => o.value);

    expect(values).not.toContain(fixtureValue);
  });

  it("a source file path without any test marker does not suppress fixture-data variable contents", () => {
    const sourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const fixtureValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `const json = "${fixtureValue}";`;

    const values = collectFromFile(source, sourcePath).map((o) => o.value);

    expect(values).toContain(fixtureValue);
  });
});

describe("NEVER: fixture-writer helper methods changed without updating the detector's FIXTURE_WRITER_CALLS set", () => {
  it("FIXTURE_WRITER_CALLS exactly matches SPEC_TREE_ENV_FIXTURE_WRITER_METHODS", () => {
    expect([...FIXTURE_WRITER_CALLS].sort()).toEqual([...SPEC_TREE_ENV_FIXTURE_WRITER_METHODS].sort());
  });
});
