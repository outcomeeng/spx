import { OUTPUT_FORMAT } from "@/commands/spec/status";
import type { RepresentativeSpecTreeFixture } from "@testing/generators/spec-tree/spec-tree";

export function specCliUnsupportedStatusFormat(fixture: RepresentativeSpecTreeFixture): string {
  const validFormats = new Set<string>(Object.values(OUTPUT_FORMAT));
  let candidate = `${fixture.root.slug}-${fixture.decision.slug}`;
  while (validFormats.has(candidate)) candidate = `${candidate}-${fixture.child.slug}`;
  return candidate;
}
