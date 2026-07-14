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

export const SPEC_TREE_CONFIG_FIELDS = {
  KINDS: "kinds",
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

export const SPEC_TREE_ADR_KIND: DecisionKind = "adr";

export const NODE_KINDS: readonly NodeKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is NodeKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.NODE,
);

export const DECISION_KINDS: readonly DecisionKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is DecisionKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.DECISION,
);

export const NODE_SUFFIXES: readonly string[] = NODE_KINDS.map((k) => KIND_REGISTRY[k].suffix);
export const DECISION_SUFFIXES: readonly string[] = DECISION_KINDS.map((k) => KIND_REGISTRY[k].suffix);

export const SPEC_TREE_GRAMMAR = {
  PRODUCT_SUFFIX: SPEC_TREE_CONFIG.PRODUCT.SUFFIX,
  EVIDENCE: {
    DIRECTORY_NAME: "tests",
    MODES: ["scenario", "mapping", "conformance", "property", "compliance"],
    LEVELS: ["l1", "l2", "l3"],
    TAILS: {
      TYPESCRIPT: ["test", "ts"],
      PYTHON: ["py"],
      RUST: ["rs"],
    },
    SEGMENT_SEPARATOR: ".",
  },
  RUNNERS: ["vitest", "playwright", "subprocess"],
  ORDER: {
    SEPARATOR: "-",
    PATTERN: /^\d+$/,
  },
  PATH_SEPARATOR: "/",
  COORDINATION_NOTES: ["PLAN.md", "ISSUES.md"],
  GUIDE_FILES: ["CLAUDE.md", "AGENTS.md"],
  LOCAL_OVERLAYS: {
    DIRECTORY_NAME: "local",
    LIFECYCLE_FILENAME: "merging.md",
    EXTENSION: ".md",
  },
  EVAL: {
    DIRECTORY_NAME: "evals",
    FILES: ["eval.toml", "cases.jsonl", "prompt.md", "history.jsonl"],
    RUNS_DIRECTORY_NAME: "runs",
  },
  SPEC_FILE: {
    CANONICAL_SUFFIX: ".spec.md",
    PRIOR_SUFFIX: ".md",
  },
  PRIOR_NODE_SUFFIXES: [".capability", ".feature", ".story"],
} as const;

export const SPEC_TREE_EVIDENCE_FILE = SPEC_TREE_GRAMMAR.EVIDENCE;

export type SpecTreeEvidenceGrammar = {
  readonly DIRECTORY_NAME: string;
  readonly MODES: readonly string[];
  readonly LEVELS: readonly string[];
  readonly TAILS: Readonly<Record<string, readonly string[]>>;
  readonly SEGMENT_SEPARATOR: string;
};
export type SpecTreeOrderGrammar = typeof SPEC_TREE_GRAMMAR.ORDER;

export type NamingSchemaVersion = {
  readonly version: string;
  readonly nodeSuffixes: readonly string[];
  readonly decisionSuffixes: readonly string[];
  readonly productSuffix: string;
  readonly evidence: SpecTreeEvidenceGrammar;
  readonly runners: readonly string[];
  readonly order: SpecTreeOrderGrammar;
  readonly pathSeparator: string;
  readonly coordinationNotes: readonly string[];
  readonly eval: typeof SPEC_TREE_GRAMMAR.EVAL;
  readonly specFileSuffix: string;
};

const NAMING_SCHEMA_VERSION_ID = {
  PRIOR_NODES: "1.0.0",
  PRIOR_SPEC: "2.0.0",
  CANONICAL: "3.0.0",
} as const;

function namingSchemaVersion(
  version: string,
  nodeSuffixes: readonly string[],
  specFileSuffix: string,
): NamingSchemaVersion {
  return {
    version,
    nodeSuffixes,
    decisionSuffixes: DECISION_SUFFIXES,
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    evidence: SPEC_TREE_GRAMMAR.EVIDENCE,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order: SPEC_TREE_GRAMMAR.ORDER,
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    eval: SPEC_TREE_GRAMMAR.EVAL,
    specFileSuffix,
  };
}

export const SPEC_TREE_NAMING_SCHEMA_VERSIONS: readonly NamingSchemaVersion[] = [
  namingSchemaVersion(
    NAMING_SCHEMA_VERSION_ID.PRIOR_NODES,
    SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES,
    SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
  ),
  namingSchemaVersion(NAMING_SCHEMA_VERSION_ID.PRIOR_SPEC, NODE_SUFFIXES, SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX),
  namingSchemaVersion(NAMING_SCHEMA_VERSION_ID.CANONICAL, NODE_SUFFIXES, SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX),
];

const VERSION_COMPONENT_SEPARATOR = ".";
const VERSION_COMPONENT_RADIX = 10;
const VERSION_MISSING_COMPONENT = 0;
const VERSION_ORDER_EQUAL = 0;
const VERSION_NUMERIC_COMPONENT = /^\d+$/;

function parseVersionComponents(version: string): number[] {
  return version.split(VERSION_COMPONENT_SEPARATOR).map((part) => {
    if (!VERSION_NUMERIC_COMPONENT.test(part)) {
      throw new Error(
        `Naming-schema version "${version}" must use numeric dotted components; "${part}" is not numeric`,
      );
    }
    return Number.parseInt(part, VERSION_COMPONENT_RADIX);
  });
}

export function compareNumericVersionIdentifiers(left: string, right: string): number {
  const leftComponents = parseVersionComponents(left);
  const rightComponents = parseVersionComponents(right);
  const length = Math.max(leftComponents.length, rightComponents.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftComponents[index] ?? VERSION_MISSING_COMPONENT)
      - (rightComponents[index] ?? VERSION_MISSING_COMPONENT);
    if (difference !== VERSION_ORDER_EQUAL) {
      return difference;
    }
  }
  return VERSION_ORDER_EQUAL;
}

export function compareNamingSchemaVersions(left: NamingSchemaVersion, right: NamingSchemaVersion): number {
  return compareNumericVersionIdentifiers(left.version, right.version);
}

export function canonicalNamingSchemaVersion(versions: readonly NamingSchemaVersion[]): NamingSchemaVersion {
  const first = versions.at(0);
  if (first === undefined) {
    throw new Error("Naming-schema version tuple must declare at least one version");
  }
  return versions.slice(1).reduce(
    (max, version) => (compareNamingSchemaVersions(version, max) > VERSION_ORDER_EQUAL ? version : max),
    first,
  );
}

export function supersededNodeSuffixes(versions: readonly NamingSchemaVersion[]): readonly string[] {
  const canonical = canonicalNamingSchemaVersion(versions);
  const canonicalSuffixes = new Set(canonical.nodeSuffixes);
  const superseded = new Set<string>();
  for (const version of versions) {
    if (version === canonical) {
      continue;
    }
    for (const suffix of version.nodeSuffixes) {
      if (!canonicalSuffixes.has(suffix)) {
        superseded.add(suffix);
      }
    }
  }
  return [...superseded];
}

export const SPEC_TREE_NAMING_VERSION: string = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).version;
export const SPEC_TREE_SUPERSEDED_NODE_SUFFIXES: readonly string[] = supersededNodeSuffixes(
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
);

export const SPEC_TREE_NODE_STATE = {
  DECLARED: "declared",
  SPECIFIED: "specified",
  FAILING: "failing",
  PASSING: "passing",
} as const;

export type SpecTreeNodeState = (typeof SPEC_TREE_NODE_STATE)[keyof typeof SPEC_TREE_NODE_STATE];

export type SpecTreeConfig = {
  readonly [SPEC_TREE_CONFIG_FIELDS.KINDS]: { readonly [K in Kind]?: KindDefinition<K> };
};

export const SPEC_TREE_SECTION = SPEC_TREE_CONFIG.SECTION;

function isKind(value: string): value is Kind {
  return Object.hasOwn(KIND_REGISTRY, value);
}

function buildDefaults(): SpecTreeConfig {
  return { kinds: { ...KIND_REGISTRY } };
}

function buildConfigFromKindNames(kindNames: readonly Kind[]): SpecTreeConfig {
  const entries = kindNames.map((kind) => [kind, KIND_REGISTRY[kind]] as const);
  return { kinds: Object.fromEntries(entries) };
}

function validate(value: unknown): Result<SpecTreeConfig> {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: `${SPEC_TREE_SECTION} section must be an object` };
  }
  const candidate = value as { [SPEC_TREE_CONFIG_FIELDS.KINDS]?: unknown };
  const kindValue = candidate[SPEC_TREE_CONFIG_FIELDS.KINDS];
  if (Array.isArray(kindValue)) {
    return validateKindList(kindValue);
  }
  if (
    typeof kindValue !== "object"
    || kindValue === null
  ) {
    return {
      ok: false,
      error:
        `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} must be an array of registry kind names or an object with registry metadata`,
    };
  }

  return validateKindDefinitionMap(kindValue as Record<string, unknown>);
}

function validateKindList(kinds: readonly unknown[]): Result<SpecTreeConfig> {
  const kindNames: Kind[] = [];
  for (const entry of kinds) {
    if (typeof entry !== "string") {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} entries must be registry kind names`,
      };
    }
    if (!isKind(entry)) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${entry}"`,
      };
    }
    kindNames.push(entry);
  }

  const duplicateKinds = kindNames.filter((kind, index) => kindNames.indexOf(kind) !== index);
  if (duplicateKinds.length > 0) {
    return {
      ok: false,
      error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains duplicate kind "${duplicateKinds[0]}"`,
    };
  }

  return { ok: true, value: buildConfigFromKindNames(kindNames) };
}

function validateKindDefinitionMap(kindEntries: Record<string, unknown>): Result<SpecTreeConfig> {
  const entries: Array<[Kind, KindDefinition<Kind>]> = [];
  for (const [key, entry] of Object.entries(kindEntries)) {
    if (!isKind(key)) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${key}"`,
      };
    }
    if (typeof entry !== "object" || entry === null) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key} must be an object with registry metadata`,
      };
    }
    const def = entry as { category?: unknown; suffix?: unknown };
    const expected = KIND_REGISTRY[key];
    if (def.category !== expected.category) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key}.category must be "${expected.category}"`,
      };
    }
    if ((entry as { label?: unknown }).label !== expected.label) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key}.label must be "${expected.label}"`,
      };
    }
    if (def.suffix !== expected.suffix) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key}.suffix must be "${expected.suffix}"`,
      };
    }
    const aliases = (entry as { aliases?: unknown }).aliases;
    if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string")) {
      return {
        ok: false,
        error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key}.aliases must be an array of strings`,
      };
    }
    if (
      aliases.length !== expected.aliases.length || aliases.some((alias, index) => alias !== expected.aliases[index])
    ) {
      return {
        ok: false,
        error:
          `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}.${key}.aliases must match the registry definition`,
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
