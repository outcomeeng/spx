import { describe, it } from "vitest";

import {
  assertSpecContextManifestClassifiesRolesIntoReadAndListed,
  assertSpecContextReadEntriesFollowGroupOrder,
} from "@testing/harnesses/spec/context";

describe("spec context manifest entry classes", () => {
  it("maps every role to its read or listed entry class", async () => {
    await assertSpecContextManifestClassifiesRolesIntoReadAndListed();
  });

  it("orders read entries by the declared role group order", async () => {
    await assertSpecContextReadEntriesFollowGroupOrder();
  });
});
