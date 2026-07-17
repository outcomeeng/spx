import { describe, expect, it } from "vitest";

import { createVerificationContextDocument } from "@/domains/verification-context/context";
import { VERIFICATION_CONTEXT_TEST_GENERATOR } from "@testing/generators/verification-context";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verification context digest", () => {
  it("is deterministic for identical payloads and changes when context input fields change", () => {
    assertProperty(
      VERIFICATION_CONTEXT_TEST_GENERATOR.digestPropertyScenario(),
      (scenario) => {
        const first = createVerificationContextDocument(scenario.payload);
        const second = createVerificationContextDocument(scenario.payload);
        const changedSubject = createVerificationContextDocument({ ...scenario.payload, subject: scenario.subject });
        const changedPredicate = createVerificationContextDocument({
          ...scenario.payload,
          predicate: scenario.predicate,
        });
        const changedWorkflow = createVerificationContextDocument({
          ...scenario.payload,
          workflow: { name: scenario.workflow },
        });
        const changedLaunchProductDir = createVerificationContextDocument({
          ...scenario.payload,
          launch: { ...scenario.payload.launch, productDir: scenario.launch.productDir },
        });
        const changedLaunchBranchSlug = createVerificationContextDocument({
          ...scenario.payload,
          launch: { ...scenario.payload.launch, branchSlug: scenario.launch.branchSlug },
        });
        const changedLaunchBranchIdentity = createVerificationContextDocument({
          ...scenario.payload,
          launch: { ...scenario.payload.launch, branchIdentity: scenario.launch.branchIdentity },
        });
        const changedLaunchHeadSha = createVerificationContextDocument({
          ...scenario.payload,
          launch: { ...scenario.payload.launch, headSha: scenario.launch.headSha },
        });
        const changedLaunchCreatedAt = createVerificationContextDocument({
          ...scenario.payload,
          launch: { ...scenario.payload.launch, createdAt: scenario.launch.createdAt },
        });
        const changedPersistence = createVerificationContextDocument({
          ...scenario.payload,
          persistence: scenario.persistence,
        });

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(changedSubject.ok).toBe(true);
        expect(changedPredicate.ok).toBe(true);
        expect(changedWorkflow.ok).toBe(true);
        expect(changedLaunchProductDir.ok).toBe(true);
        expect(changedLaunchBranchSlug.ok).toBe(true);
        expect(changedLaunchBranchIdentity.ok).toBe(true);
        expect(changedLaunchHeadSha.ok).toBe(true);
        expect(changedLaunchCreatedAt.ok).toBe(true);
        expect(changedPersistence.ok).toBe(true);
        if (
          !first.ok
          || !second.ok
          || !changedSubject.ok
          || !changedPredicate.ok
          || !changedWorkflow.ok
          || !changedLaunchProductDir.ok
          || !changedLaunchBranchSlug.ok
          || !changedLaunchBranchIdentity.ok
          || !changedLaunchHeadSha.ok
          || !changedLaunchCreatedAt.ok
          || !changedPersistence.ok
        ) return;
        expect(second.value.digest).toBe(first.value.digest);
        expect(changedSubject.value.digest).not.toBe(first.value.digest);
        expect(changedPredicate.value.digest).not.toBe(first.value.digest);
        expect(changedWorkflow.value.digest).not.toBe(first.value.digest);
        expect(changedLaunchProductDir.value.digest).not.toBe(first.value.digest);
        expect(changedLaunchBranchSlug.value.digest).not.toBe(first.value.digest);
        expect(changedLaunchBranchIdentity.value.digest).not.toBe(first.value.digest);
        expect(changedLaunchHeadSha.value.digest).not.toBe(first.value.digest);
        expect(changedLaunchCreatedAt.value.digest).not.toBe(first.value.digest);
        expect(changedPersistence.value.digest).not.toBe(first.value.digest);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
