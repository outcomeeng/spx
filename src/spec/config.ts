import type { ConfigDescriptor, Result } from "@/config/types";

const SPEC_TREE_KIND_CATEGORY_VALUES = {
  NODE: "node",
  DECISION: "decision",
} as const;

const SPEC_TREE_EMPTY_ALIASES = [] as const;

export const SPEC_TREE_CONFIG = {
  SECTION: "specTree",
  ROOT_DIRECTORY: "spx",
  PRODUCT: {
    LABEL: "Product",
    SUFFIX: ".product.md",
  },
  CATEGORY: SPEC_TREE_KIND_CATEGORY_VALUES,
  KINDS: {
    enabler: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Enabler",
      suffix: ".enabler",
      aliases: SPEC_TREE_EMPTY_ALIASES,
    },
    outcome: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Outcome",
      suffix: ".outcome",
      aliases: SPEC_TREE_EMPTY_ALIASES,
    },
    adr: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.DECISION,
      label: "ADR",
      suffix: ".adr.md",
      aliases: SPEC_TREE_EMPTY_ALIASES,
    },
    pdr: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.DECISION,
      label: "PDR",
      suffix: ".pdr.md",
      aliases: SPEC_TREE_EMPTY_ALIASES,
    },
  },
} as const;

export const SPEC_TREE_KIND_CATEGORY = SPEC_TREE_CONFIG.CATEGORY;

export type SpecTreeKindCategory = (typeof SPEC_TREE_KIND_CATEGORY)[keyof typeof SPEC_TREE_KIND_CATEGORY];

export const KIND_REGISTRY = SPEC_TREE_CONFIG.KINDS;

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

export const SPEC_TREE_SECTION = SPEC_TREE_CONFIG.SECTION;

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
        error: `${SPEC_TREE_SECTION}.kinds.${key} must be an object with registry metadata`,
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
    if ((entry as { label?: unknown }).label !== expected.label) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.label must be "${expected.label}"`,
      };
    }
    if (def.suffix !== expected.suffix) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.suffix must be "${expected.suffix}"`,
      };
    }
    const aliases = (entry as { aliases?: unknown }).aliases;
    if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string")) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.aliases must be an array of strings`,
      };
    }
    if (
      aliases.length !== expected.aliases.length || aliases.some((alias, index) => alias !== expected.aliases[index])
    ) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.kinds.${key}.aliases must match the registry definition`,
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
