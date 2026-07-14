import {
  assertClassificationTreeMaterialization,
  assertDelegationTreeConsultationClasses,
  assertGeneratedNodeSlugsAreReadable,
} from "@testing/harnesses/node-status/node-status-test-support";
import { describe, it } from "vitest";

describe("node-status test support", () => {
  it("materializes generated classification facts and resolves recorded evidence", async () => {
    await assertClassificationTreeMaterialization();
  });

  it("generates delegation trees that span every consultation class", () => {
    assertDelegationTreeConsultationClasses();
  });

  it("generates node slugs from the readable slug domain", () => {
    assertGeneratedNodeSlugsAreReadable();
  });
});
