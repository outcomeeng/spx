import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createVerificationContextDocument,
  VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS,
} from "@/domains/verification-context/context";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";

describe("verification context shape", () => {
  it("excludes runtime-only outcome fields from the persisted pre-execution document", () => {
    fc.assert(
      fc.property(VERIFICATION_CONTEXT_TEST_GENERATOR.payload(), (payload) => {
        const document = createVerificationContextDocument(payload);

        expect(document.ok).toBe(true);
        if (!document.ok) return;
        const serialized = JSON.stringify(document.value);
        for (const field of Object.values(VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS)) {
          expect(serialized).not.toContain(field);
        }
      }),
    );
  });
});
