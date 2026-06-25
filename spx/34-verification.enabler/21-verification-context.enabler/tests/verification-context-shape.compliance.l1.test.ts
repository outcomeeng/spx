import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createVerificationContextDocument,
  isVerificationContextJsonObject,
  VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS,
} from "@/domains/verification-context/context";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";

function collectObjectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectObjectKeys(item));
  if (!isVerificationContextJsonObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectObjectKeys(child)]);
}

describe("verification context shape", () => {
  it("excludes runtime-only outcome fields from the persisted pre-execution document", () => {
    fc.assert(
      fc.property(VERIFICATION_CONTEXT_TEST_GENERATOR.payload(), (payload) => {
        const document = createVerificationContextDocument(payload);

        expect(document.ok).toBe(true);
        if (!document.ok) return;
        const keys = new Set(collectObjectKeys(JSON.parse(document.value.canonicalJson) as unknown));
        for (const field of Object.values(VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS)) {
          expect(keys.has(field)).toBe(false);
        }
      }),
    );
  });
});
