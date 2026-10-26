import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { containmentLayoutEntries, sameVersionContainmentCases } from "@testing/generators/spec-tree/kind-containment";
import { createSource } from "@testing/generators/spec-tree/spec-tree";

const cases = sameVersionContainmentCases();

describe("parent kind and child kind to assembly outcome", () => {
  it.each(cases.filter((testCase) => testCase.admitted))(
    "assembles a $label as the parent's child",
    async ({ layout }) => {
      const snapshot = await readSpecTree({ source: createSource(containmentLayoutEntries(layout)) });

      const parent = snapshot.allNodes.find((node) => node.id === layout.parent.slug);
      expect(parent?.children.map((child) => child.id)).toEqual([layout.child.slug]);
    },
  );

  it.each(cases.filter((testCase) => !testCase.admitted))(
    "fails the read naming a $label",
    async ({ layout }) => {
      const failure = await readSpecTree({ source: createSource(containmentLayoutEntries(layout)) }).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      const message = (failure as Error).message;
      expect(message).toContain(layout.child.slug);
      expect(message).toContain(layout.child.kind);
      expect(message).toContain(layout.parent.slug);
      expect(message).toContain(layout.parent.kind);
    },
  );
});
