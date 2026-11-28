import { describe, expect, it, vi } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { createSource } from "@testing/generators/spec-tree/spec-tree";

describe("spec-tree source", () => {
  it("reads an explicitly injected source", async () => {
    vi.doMock("@/lib/spec-tree/config");
    await expect(readSpecTree({ source: createSource([]) })).resolves.toMatchObject({ decisions: [] });
  });
});
