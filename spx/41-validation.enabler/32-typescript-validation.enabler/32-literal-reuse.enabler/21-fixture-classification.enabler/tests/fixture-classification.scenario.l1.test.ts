import { describe, expect, it } from "vitest";

import { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/domains/spec/fixture-writer-methods";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  arbitraryTestMarkerFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

import { collectFromFile } from "./support";

describe("fixture-classification — scenarios", () => {
  it("fixture-writer paths and payload strings do not contribute occurrences while assertion-position literals do", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const writerPath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const writerPayload = sampleLiteralTestValue(arbitraryDomainLiteral());
    const assertionLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const writerMethod = SPEC_TREE_ENV_FIXTURE_WRITER_METHODS[2];
    const source = `
      async function seed(env) {
        await env.${writerMethod}("${writerPath}", "${writerPayload}");
        expect(actual).toBe("${assertionLiteral}");
      }
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).not.toContain(writerPath);
    expect(values).not.toContain(writerPayload);
    expect(values).toContain(assertionLiteral);
  });

  it("literals inside a function boundary within a fixture-writer argument still contribute occurrences while the writer path does not", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const writerPath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const callbackLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const writerMethod = SPEC_TREE_ENV_FIXTURE_WRITER_METHODS[2];
    const source = `
      async function seed(env) {
        await env.${writerMethod}("${writerPath}", () => {
          return "${callbackLiteral}";
        });
      }
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).not.toContain(writerPath);
    expect(values).toContain(callbackLiteral);
  });

  it("a fixture-writer call nested as the payload of another writer keeps both argument lists suppressed", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const outerPath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const innerPath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const innerPayload = sampleLiteralTestValue(arbitraryDomainLiteral());
    const outerMethod = SPEC_TREE_ENV_FIXTURE_WRITER_METHODS[2];
    const innerMethod = SPEC_TREE_ENV_FIXTURE_WRITER_METHODS[1];
    const source = `
      async function seed(env) {
        await env.${outerMethod}(
          "${outerPath}",
          env.${innerMethod}("${innerPath}", "${innerPayload}"),
        );
      }
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).not.toContain(outerPath);
    expect(values).not.toContain(innerPath);
    expect(values).not.toContain(innerPayload);
  });

  it("values inside a fixture-data variable do not contribute occurrences while assertion-position literals do", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const fixtureStatusValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const fixtureVerdictValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const assertionLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `
      const verdictFixture = {
        status: "${fixtureStatusValue}",
        verdict: "${fixtureVerdictValue}",
      };
      expect(actual).toBe("${assertionLiteral}");
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).not.toContain(fixtureStatusValue);
    expect(values).not.toContain(fixtureVerdictValue);
    expect(values).toContain(assertionLiteral);
  });

  it("literals in inline object destructuring still contribute occurrences when no fixture identifier names the data", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const destructuringDefault = sampleLiteralTestValue(arbitraryDomainLiteral());
    const inlineObjectValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `
      const { status = "${destructuringDefault}" } = {
        verdict: "${inlineObjectValue}",
      };
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).toContain(destructuringDefault);
    expect(values).toContain(inlineObjectValue);
  });

  it("compound-role variable names and SCREAMING_SNAKE fixture identifiers suppress their literal contents while assertion-position literals still contribute", () => {
    const testFilePath = sampleLiteralTestValue(arbitraryTestFilePath());
    const compoundRoleValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const screamingSnakeValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const assertionLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `
      const yamlSource = "${compoundRoleValue}";
      const VERDICT_FIXTURE = "${screamingSnakeValue}";
      expect(actual).toBe("${assertionLiteral}");
    `;

    const values = collectFromFile(source, testFilePath).map((o) => o.value);

    expect(values).not.toContain(compoundRoleValue);
    expect(values).not.toContain(screamingSnakeValue);
    expect(values).toContain(assertionLiteral);
  });

  it("a file path containing the .test. filename marker outside a tests directory is treated as test-authored", () => {
    const testMarkerPath = sampleLiteralTestValue(arbitraryTestMarkerFilePath());
    const fixtureValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const assertionLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const source = `
      const json = "${fixtureValue}";
      expect(actual).toBe("${assertionLiteral}");
    `;

    const values = collectFromFile(source, testMarkerPath).map((o) => o.value);

    expect(values).not.toContain(fixtureValue);
    expect(values).toContain(assertionLiteral);
  });
});
