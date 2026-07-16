import { describe, expect, it } from "vitest";

import { normalizeVerificationContextFileSubjectPath } from "@/domains/verification-context/context";
import {
  arbitrarySafeFileScopeIdentity,
  arbitraryUnsafeFileScopeIdentity,
} from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verify file-scope normalization", () => {
  it("preserves safe canonical product-relative identities idempotently", () => {
    assertProperty(
      arbitrarySafeFileScopeIdentity(),
      (path) => {
        expect(normalizeVerificationContextFileSubjectPath(path)).toBe(path);
        expect(normalizeVerificationContextFileSubjectPath(
          normalizeVerificationContextFileSubjectPath(path) ?? path,
        )).toBe(path);
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
