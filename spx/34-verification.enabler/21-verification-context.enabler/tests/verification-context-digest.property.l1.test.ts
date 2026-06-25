import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createVerificationContextDocument } from "@/domains/verification-context/context";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";

describe("verification context digest", () => {
  it("is deterministic for identical payloads and changes when context input fields change", () => {
    fc.assert(
      fc.property(
        VERIFICATION_CONTEXT_TEST_GENERATOR.payload(),
        VERIFICATION_CONTEXT_TEST_GENERATOR.subject(),
        VERIFICATION_CONTEXT_TEST_GENERATOR.predicate(),
        VERIFICATION_CONTEXT_TEST_GENERATOR.workflow(),
        VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt(),
        (payload, subject, predicate, workflow, launchedAt) => {
          const createdAt = launchedAt.toISOString();
          fc.pre(JSON.stringify(payload.subject) !== JSON.stringify(subject));
          fc.pre(payload.predicate !== predicate);
          fc.pre(payload.workflow.name !== workflow);
          fc.pre(payload.launch.createdAt !== createdAt);

          const first = createVerificationContextDocument(payload);
          const second = createVerificationContextDocument(payload);
          const changedSubject = createVerificationContextDocument({ ...payload, subject });
          const changedPredicate = createVerificationContextDocument({ ...payload, predicate });
          const changedWorkflow = createVerificationContextDocument({ ...payload, workflow: { name: workflow } });
          const changedLaunch = createVerificationContextDocument({
            ...payload,
            launch: { ...payload.launch, createdAt },
          });

          expect(first.ok).toBe(true);
          expect(second.ok).toBe(true);
          expect(changedSubject.ok).toBe(true);
          expect(changedPredicate.ok).toBe(true);
          expect(changedWorkflow.ok).toBe(true);
          expect(changedLaunch.ok).toBe(true);
          if (
            !first.ok
            || !second.ok
            || !changedSubject.ok
            || !changedPredicate.ok
            || !changedWorkflow.ok
            || !changedLaunch.ok
          ) return;
          expect(second.value.digest).toBe(first.value.digest);
          expect(changedSubject.value.digest).not.toBe(first.value.digest);
          expect(changedPredicate.value.digest).not.toBe(first.value.digest);
          expect(changedWorkflow.value.digest).not.toBe(first.value.digest);
          expect(changedLaunch.value.digest).not.toBe(first.value.digest);
        },
      ),
    );
  });
});
