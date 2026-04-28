import type { ConfigDescriptor, Result } from "@/config/types";

export const SPEC_TREE_KIND_CATEGORY = {
  NODE: "node",
  DECISION: "decision",
} as const;

export type SpecTreeKindCategory = (typeof SPEC_TREE_KIND_CATEGORY)[keyof typeof SPEC_TREE_KIND_CATEGORY];

export const KIND_REGISTRY = {
  enabler: { category: SPEC_TREE_KIND_CATEGORY.NODE, suffix: ".enabler" },
  outcome: { category: SPEC_TREE_KIND_CATEGORY.NODE, suffix: ".outcome" },
  adr: { category: SPEC_TREE_KIND_CATEGORY.DECISION, suffix: ".adr.md" },
  pdr: { category: SPEC_TREE_KIND_CATEGORY.DECISION, suffix: ".pdr.md" },
} as const;

export type Kind = keyof typeof KIND_REGISTRY;
export type KindDefinition<K extends Kind> = (typeof KIND_REGISTRY)[K];

export type NodeKind = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends typeof SPEC_TREE_KIND_CATEGORY.NODE ? K : never;
}[Kind];

export type DecisionKind = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends typeof SPEC_TREE_KIND_CATEGORY.DECISION ? K : never;
}[Kind];

export const NODE_KINDS: readonly NodeKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is NodeKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.NODE,
);

export const DECISION_KINDS: readonly DecisionKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is DecisionKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.DECISION,
);

export const NODE_SUFFIXES: readonly string[] = NODE_KINDS.map((k) => KIND_REGISTRY[k].suffix);
export const DECISION_SUFFIXES: readonly string[] = DECISION_KINDS.map((k) => KIND_REGISTRY[k].suffix);

export type SpecTreeConfig = {
  readonly kinds: { readonly [K in Kind]?: KindDefinition<K> };
};

export const SPEC_TREE_SECTION = "specTree";

function isKind(value: string): value is Kind {
  return Object.prototype.hasOwnProperty.call(KIND_REGISTRY, value);
}

function buildDefaults(): SpecTreeConfig {
  return { kinds: { ...KIND_REGISTRY } };
}

function validate(value: unknown): Result<SpecTreeConfig> {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: `${SPEC_TREE_SECTION} section must be an object` };
  }
  const candidate = value as { kinds?: unknown };
  if (
    typeof candidate.kinds !== "object"
    || candidate.kinds === null
    || Array.isArray(candidate.kinds)
  ) {
    return {
      ok: false,
      error: `${SPEC_TREE_SECTION}.kinds must be an object keyed by kind name`,
    };
  }

  const entries: Array<[Kind, KindDefinition<Kind>]> = [];
  const kindEntries = candidate.kinds as Record<string, unknown>;
  for (const [key, entry] of Object.entries(kindEntries)) {
    if (!isKind(key)) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds contains unknown kind "${key}"`,
      };
    }
    if (typeof entry !== "object" || entry === null) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key} must be an object with category and suffix`,
      };
    }
    const def = entry as { category?: unknown; suffix?: unknown };
    const expected = KIND_REGISTRY[key];
    if (def.category !== expected.category) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.category must be "${expected.category}"`,
      };
    }
    if (def.suffix !== expected.suffix) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.suffix must be "${expected.suffix}"`,
      };
    }
    entries.push([key, expected]);
  }

  const kinds = Object.fromEntries(entries) as SpecTreeConfig["kinds"];
  return { ok: true, value: { kinds } };
}

export const specTreeConfigDescriptor: ConfigDescriptor<SpecTreeConfig> = {
  section: SPEC_TREE_SECTION,
  defaults: buildDefaults(),
  validate,
};
