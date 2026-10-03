import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { createSource } from "@testing/generators/spec-tree/spec-tree";

jest.mock("@/lib/spec-tree/config");

describe("spec-tree source", () => {
  it("reads an explicitly injected source", async () => {
    await expect(readSpecTree({ source: createSource([]) })).resolves.toMatchObject({ decisions: [] });
  });
});
