import { describe, expect, it } from "vitest";

import { validateAuditScope } from "@/domains/verify/verify";
import { arbitraryChangesetClassScopePayload, changesetClassKindDomain } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("changeset audit class kind compatibility", () => {
  it("maps every registered audit kind to accepted or rejected under the changeset class", () => {
    expect(
      changesetClassKindDomain().map(({ auditKind }) => ({
        auditKind,
        accepted: validateAuditScope(
          sampleVerifyTestValue(arbitraryChangesetClassScopePayload(auditKind)),
        ).ok,
      })),
    ).toStrictEqual(changesetClassKindDomain());
  });
});
