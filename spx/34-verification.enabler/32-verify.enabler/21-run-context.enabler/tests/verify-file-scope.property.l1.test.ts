import { describe, expect, it } from "vitest";

import { normalizeVerificationContextFileSubjectPath } from "@/domains/verification-context/context";
import {
  arbitraryFileScopeIdentityScenario,
  arbitraryUnsafeFileScopeIdentity,
} from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verify file-scope normalization", () => {
  it("normalizes safe product-relative identities idempotently", () => {
    assertProperty(
      arbitraryFileScopeIdentityScenario(),
      (scenario) => {
        expect(normalizeVerificationContextFileSubjectPath(scenario.input)).toBe(scenario.normalized);
        expect(normalizeVerificationContextFileSubjectPath(
          normalizeVerificationContextFileSubjectPath(scenario.input) ?? scenario.input,
        )).toBe(scenario.normalized);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects unsafe or empty file identities", () => {
    assertProperty(
      arbitraryUnsafeFileScopeIdentity(),
      (path) => {
        expect(normalizeVerificationContextFileSubjectPath(path)).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
