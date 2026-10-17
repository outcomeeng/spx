/**
 * The kinds the filename-grammar spec declares, with the category, directory or decision-file
 * suffix, and opening keyword the spec states for each.
 *
 * The record is exhaustive over `Kind`, so a kind added to the registry without a declaration here
 * fails the type check. Every value is read from the spec's own statements — the node kinds each
 * naming-schema version accepts, the decision forms, and the opening keywords — and from no field
 * the library resolves them through, so reclassifying a kind in the registry changes the library
 * and leaves these declarations standing.
 *
 * @module generators/spec-tree/declared-kinds
 */

import type { Kind } from "@/lib/spec-tree";

export const DECLARED_KIND_CATEGORY = { NODE: "node", OUTPUT: "output", DECISION: "decision" } as const;

export type DeclaredKindCategory = (typeof DECLARED_KIND_CATEGORY)[keyof typeof DECLARED_KIND_CATEGORY];

type DeclaredKindForm = {
  readonly category: DeclaredKindCategory;
  readonly suffix: string;
};

export const DECLARED_KIND_FORMS = {
  enabler: { category: DECLARED_KIND_CATEGORY.NODE, suffix: ".enabler" },
  outcome: { category: DECLARED_KIND_CATEGORY.NODE, suffix: ".outcome" },
  substrate: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".substrate" },
  capability: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".capability" },
  domain: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".domain" },
  interface: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".interface" },
  surface: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".surface" },
  variant: { category: DECLARED_KIND_CATEGORY.OUTPUT, suffix: ".variant" },
  adr: { category: DECLARED_KIND_CATEGORY.DECISION, suffix: ".adr.md" },
  pdr: { category: DECLARED_KIND_CATEGORY.DECISION, suffix: ".pdr.md" },
} as const satisfies Record<Kind, DeclaredKindForm>;

/** The opening keyword the spec states for each output kind that carries its own; a `variant` takes its parent's. */
export const DECLARED_OUTPUT_OPENINGS = {
  substrate: "SUPPLIES",
  capability: "PROVIDES",
  domain: "OWNS",
  interface: "ADAPTS",
  surface: "EXPOSES",
} as const;

/** The directory suffix of a nested 4.0 product scope. */
export const DECLARED_PRODUCT_NODE_SUFFIX = ".product";

/** The kind a 4.0 root spec declares in its front matter. */
export const DECLARED_PRODUCT_KIND = "product";

/** Every kind the grammar declares. */
export function declaredKinds(): readonly Kind[] {
  return Object.keys(DECLARED_KIND_FORMS) as Kind[];
}

/** The declared kinds of one category. */
export function declaredKindsOfCategory(category: DeclaredKindCategory): readonly Kind[] {
  return declaredKinds().filter((kind) => DECLARED_KIND_FORMS[kind].category === category);
}

/** The suffixes of the declared kinds of one category. */
export function declaredSuffixesOfCategory(category: DeclaredKindCategory): readonly string[] {
  return declaredKindsOfCategory(category).map((kind) => DECLARED_KIND_FORMS[kind].suffix);
}
