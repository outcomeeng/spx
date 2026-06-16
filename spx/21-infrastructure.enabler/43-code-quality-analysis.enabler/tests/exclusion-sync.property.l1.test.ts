import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSonarExclusions, SONAR_EXCLUSIONS_KEY } from "@/lib/sonarcloud/exclusions";
import { arbitraryFixturePathSet } from "@testing/generators/sonarcloud/exclusions";

function renderSingleLine(entries: readonly string[]): string {
  return `${SONAR_EXCLUSIONS_KEY}=${entries.join(",")}\n`;
}

function renderContinuationLines(entries: readonly string[]): string {
  const body = entries.map((entry, index) => (index === 0 ? `${SONAR_EXCLUSIONS_KEY}=${entry}` : `  ${entry}`));
  return `${body.join(",\\\n")}\n`;
}

describe("parseSonarExclusions", () => {
  it("yields the same path set whether the value is single-line or spread across continuation lines", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (entries) => {
        const fromSingle = parseSonarExclusions(renderSingleLine(entries));
        const fromContinuation = parseSonarExclusions(renderContinuationLines(entries));
        expect(fromContinuation).toEqual(fromSingle);
      }),
    );
  });

  it("recovers exactly the entries that were written", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (entries) => {
        expect([...parseSonarExclusions(renderContinuationLines(entries))].sort()).toEqual([...entries].sort());
      }),
    );
  });

  it("ignores comment lines and the python-version setting", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (entries) => {
        const text = `# a comment\nsonar.python.version=3.13, 3.14\n${renderContinuationLines(entries)}`;
        expect([...parseSonarExclusions(text)].sort()).toEqual([...entries].sort());
      }),
    );
  });
});
