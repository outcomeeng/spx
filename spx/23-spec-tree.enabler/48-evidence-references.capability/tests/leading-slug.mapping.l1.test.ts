import { describe, expect, it } from "vitest";

import { readSpecTreeLeadingSlugs } from "@/lib/spec-tree";
import { LEADING_SLUG_CASES, leadingSlugCaseText } from "@testing/generators/spec-tree/leading-slug";

describe("leading-slug: the leading slug each line opens", () => {
  it.each(LEADING_SLUG_CASES.map((leadingSlugCase) => [leadingSlugCase.label, leadingSlugCase] as const))(
    "%s",
    (_label, leadingSlugCase) => {
      const slugs = readSpecTreeLeadingSlugs(leadingSlugCaseText(leadingSlugCase));

      expect(slugs.find(({ line }) => line === leadingSlugCase.line)?.slug).toBe(leadingSlugCase.slug);
    },
  );
});
