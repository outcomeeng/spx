import type { ConfigDescriptor, Result } from "@/config/types";

const SPEC_TREE_KIND_CATEGORY_VALUES = {
  NODE: "node",
  PRODUCT: "product",
  DECISION: "decision",
} as const;

/** The registry key of every kind spx reads, each named once; `SPEC_TREE_CONFIG.KINDS` is keyed by these. */
const SPEC_TREE_KIND_NAME = {
  ENABLER: "enabler",
  OUTCOME: "outcome",
  PRODUCT: "product",
  SUBSTRATE: "substrate",
  CAPABILITY: "capability",
  DOMAIN: "domain",
  INTERFACE: "interface",
  SURFACE: "surface",
  VARIANT: "variant",
  ADR: "adr",
  PDR: "pdr",
} as const;

/** The clause keywords node-kind openings are written with, each named once. */
export const SPEC_TREE_OPENING_KEYWORD = {
  PROVIDES: "PROVIDES",
  SUPPLIES: "SUPPLIES",
  OWNS: "OWNS",
  ADAPTS: "ADAPTS",
  EXPOSES: "EXPOSES",
  WE_BELIEVE_THAT: "WE BELIEVE THAT",
  FOR: "FOR",
  TO: "TO",
  SO_THAT: "SO THAT",
  CAN: "CAN",
  WILL: "WILL",
  CONTRIBUTING_TO: "CONTRIBUTING TO",
} as const;

/** How a kind's opening or containment is stated: fixed on the kind, or inherited from the parent kind. */
export const SPEC_TREE_KIND_SELECTOR = {
  FIXED: "fixed",
  INHERIT: "inherit",
} as const;

const SPEC_TREE_EMPTY_ALIASES = [] as const;

const KEYWORD = SPEC_TREE_OPENING_KEYWORD;
const SELECTOR = SPEC_TREE_KIND_SELECTOR;
const KIND_NAME = SPEC_TREE_KIND_NAME;

/** The fixed foundational order of the 4.0 output kinds; each admits its own kind and every kind before it. */
const SPEC_TREE_OUTPUT_KIND_ORDER = [
  KIND_NAME.SUBSTRATE,
  KIND_NAME.CAPABILITY,
  KIND_NAME.DOMAIN,
  KIND_NAME.INTERFACE,
  KIND_NAME.SURFACE,
] as const;

type SpecTreeOutputKindName = (typeof SPEC_TREE_OUTPUT_KIND_ORDER)[number];

function outputKindAdmits(kind: SpecTreeOutputKindName): readonly string[] {
  const position = SPEC_TREE_OUTPUT_KIND_ORDER.indexOf(kind);
  return [...SPEC_TREE_OUTPUT_KIND_ORDER.slice(0, position + 1), KIND_NAME.VARIANT];
}

function fixedOpening(...form: readonly string[]) {
  return { selector: SELECTOR.FIXED, form } as const;
}

function fixedContainment(admits: readonly string[]) {
  return { selector: SELECTOR.FIXED, admits } as const;
}

const INHERITED_SELECTOR = { selector: SELECTOR.INHERIT } as const;

export const SPEC_TREE_CONFIG = {
  SECTION: "specTree",
  ROOT_DIRECTORY: "spx",
  PRODUCT: {
    SUFFIX: ".product.md",
  },
  CATEGORY: SPEC_TREE_KIND_CATEGORY_VALUES,
  KINDS: {
    [KIND_NAME.ENABLER]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Enabler",
      suffix: ".enabler",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.PROVIDES, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment([KIND_NAME.ENABLER]),
    },
    [KIND_NAME.OUTCOME]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Outcome",
      suffix: ".outcome",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.WE_BELIEVE_THAT, KEYWORD.WILL, KEYWORD.CONTRIBUTING_TO),
      containment: fixedContainment([KIND_NAME.ENABLER, KIND_NAME.OUTCOME]),
    },
    [KIND_NAME.PRODUCT]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.PRODUCT,
      label: "Product",
      suffix: ".product",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      containment: fixedContainment([...SPEC_TREE_OUTPUT_KIND_ORDER, KIND_NAME.PRODUCT]),
    },
    [KIND_NAME.SUBSTRATE]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Substrate",
      suffix: ".substrate",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.SUPPLIES, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment(outputKindAdmits(KIND_NAME.SUBSTRATE)),
    },
    [KIND_NAME.CAPABILITY]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Capability",
      suffix: ".capability",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.PROVIDES, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment(outputKindAdmits(KIND_NAME.CAPABILITY)),
    },
    [KIND_NAME.DOMAIN]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Domain",
      suffix: ".domain",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.OWNS, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment(outputKindAdmits(KIND_NAME.DOMAIN)),
    },
    [KIND_NAME.INTERFACE]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Interface",
      suffix: ".interface",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.ADAPTS, KEYWORD.FOR, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment(outputKindAdmits(KIND_NAME.INTERFACE)),
    },
    [KIND_NAME.SURFACE]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Surface",
      suffix: ".surface",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: fixedOpening(KEYWORD.EXPOSES, KEYWORD.TO, KEYWORD.SO_THAT, KEYWORD.CAN),
      containment: fixedContainment(outputKindAdmits(KIND_NAME.SURFACE)),
    },
    [KIND_NAME.VARIANT]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Variant",
      suffix: ".variant",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: INHERITED_SELECTOR,
      containment: INHERITED_SELECTOR,
    },
    [KIND_NAME.ADR]: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.DECISION,
      label: "ADR",
      suffix: ".adr.md",
      aliases: SPEC_TREE_EMPTY_ALIASES,
    },
    [KIND_NAME.PDR]: {
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

type KindOfCategory<C extends SpecTreeKindCategory> = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends C ? K : never;
}[Kind];

export type NodeKind = KindOfCategory<typeof SPEC_TREE_KIND_CATEGORY.NODE>;
export type ProductKind = KindOfCategory<typeof SPEC_TREE_KIND_CATEGORY.PRODUCT>;
export type DecisionKind = KindOfCategory<typeof SPEC_TREE_KIND_CATEGORY.DECISION>;

/** A kind a node directory carries: an output or variant kind, or a nested product. */
export type NodeDirectoryKind = NodeKind | ProductKind;

export const SPEC_TREE_ADR_KIND: DecisionKind = KIND_NAME.ADR;

/** The product kind's registry key, which a 4.0 root spec's front matter declares as its `kind`. */
export const SPEC_TREE_PRODUCT_KIND: ProductKind = KIND_NAME.PRODUCT;

function kindsOfCategory<C extends SpecTreeKindCategory>(category: C): readonly KindOfCategory<C>[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).filter(
    (kind): kind is KindOfCategory<C> => KIND_REGISTRY[kind].category === category,
  );
}

export const NODE_KINDS: readonly NodeKind[] = kindsOfCategory(SPEC_TREE_KIND_CATEGORY.NODE);
export const PRODUCT_KINDS: readonly ProductKind[] = kindsOfCategory(SPEC_TREE_KIND_CATEGORY.PRODUCT);
export const DECISION_KINDS: readonly DecisionKind[] = kindsOfCategory(SPEC_TREE_KIND_CATEGORY.DECISION);

export const NODE_SUFFIXES: readonly string[] = NODE_KINDS.map((k) => KIND_REGISTRY[k].suffix);
export const DECISION_SUFFIXES: readonly string[] = DECISION_KINDS.map((k) => KIND_REGISTRY[k].suffix);

export function isSpecTreeKind(value: string): value is Kind {
  return Object.hasOwn(KIND_REGISTRY, value);
}

/**
 * The opening form a node kind's spec opens with — its ordered clause keywords, the first
 * of which is its opening keyword — resolved through parent-kind inheritance. A product
 * or decision kind carries no opening, and an inheriting kind with no resolvable parent
 * resolves none.
 */
export function resolveKindOpeningForm(kind: Kind, parentKind?: Kind): readonly string[] | undefined {
  const definition: KindDefinition<Kind> = KIND_REGISTRY[kind];
  if (!("opening" in definition)) return undefined;
  if (definition.opening.selector === SELECTOR.FIXED) return definition.opening.form;
  if (parentKind === undefined || parentKind === kind) return undefined;
  return resolveKindOpeningForm(parentKind);
}

/** The opening keyword a node kind's Digest reads: the first clause keyword of its resolved opening form. */
export function resolveKindOpeningKeyword(kind: Kind, parentKind?: Kind): string | undefined {
  return resolveKindOpeningForm(kind, parentKind)?.at(0);
}

/**
 * The child kinds a kind admits, resolved through parent-kind inheritance: an inheriting
 * kind admits its parent kind's set less itself. A decision kind admits none, and an
 * inheriting kind with no resolvable parent resolves none.
 */
export function resolveKindAdmittedChildren(kind: Kind, parentKind?: Kind): readonly Kind[] | undefined {
  const definition: KindDefinition<Kind> = KIND_REGISTRY[kind];
  if (!("containment" in definition)) return undefined;
  if (definition.containment.selector === SELECTOR.FIXED) {
    return definition.containment.admits.filter(isSpecTreeKind);
  }
  if (parentKind === undefined || parentKind === kind) return undefined;
  return resolveKindAdmittedChildren(parentKind)?.filter((admitted) => admitted !== kind);
}

/** The coordination notes a node may carry, each named once; the grammar lists them as `COORDINATION_NOTES`. */
export const SPEC_TREE_COORDINATION_NOTE = {
  PLAN: "PLAN.md",
  ISSUES: "ISSUES.md",
} as const;

/** The methodology lines a naming-schema version serves, each named once. */
export const SPEC_TREE_METHODOLOGY_LINE = {
  V3_0: "3.0",
  V3_1: "3.1",
  V3_2: "3.2",
  V4_0: "4.0",
} as const;

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
    DIGIT_RUNS_PATTERN: /^\d+(?:\.\d+)*$/,
    TWO_DIGIT_PATTERN: /^[1-9]\d(?:\.\d{2})*$/,
  },
  PATH_SEPARATOR: "/",
  COORDINATION_NOTE: SPEC_TREE_COORDINATION_NOTE,
  COORDINATION_NOTES: [SPEC_TREE_COORDINATION_NOTE.PLAN, SPEC_TREE_COORDINATION_NOTE.ISSUES],
  GUIDE_FILES: ["CLAUDE.md", "AGENTS.md"],
  STATUS_FILENAME: "spx.status.json",
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
  PROBE: {
    DIRECTORY_NAME: "probes",
    PROTOCOL_FILENAME: "probe.md",
    RUNS_DIRECTORY_NAME: "runs",
  },
  SPEC_FILE: {
    SPEC_DOCUMENT_SUFFIX: ".spec.md",
    PLAIN_SUFFIX: ".md",
  },
  UNREGISTERED_NODE_SUFFIXES: [".feature", ".story"],
  METHODOLOGY_LINE: SPEC_TREE_METHODOLOGY_LINE,
} as const;

export const SPEC_TREE_EVIDENCE_FILE = SPEC_TREE_GRAMMAR.EVIDENCE;

export type SpecTreeEvidenceGrammar = {
  readonly DIRECTORY_NAME: string;
  readonly MODES: readonly string[];
  readonly LEVELS: readonly string[];
  readonly TAILS: Readonly<Record<string, readonly string[]>>;
  readonly SEGMENT_SEPARATOR: string;
};

export type SpecTreeOrderGrammar = {
  readonly SEPARATOR: string;
  readonly PATTERN: RegExp;
};

export type NamingSchemaVersion = {
  readonly version: string;
  /** The `outcomeeng/methodology` lines this version encodes; empty for a version that serves no declaration. */
  readonly methodologyLines: readonly string[];
  readonly nodeSuffixes: readonly string[];
  readonly decisionSuffixes: readonly string[];
  /** The suffix of the root product spec directly under `spx/`. */
  readonly productSuffix: string;
  /** The `kind` the root product spec's front matter declares, for a version whose root carries no suffix of its own. */
  readonly productKind?: ProductKind;
  readonly evidence: SpecTreeEvidenceGrammar;
  readonly runners: readonly string[];
  readonly order: SpecTreeOrderGrammar;
  readonly pathSeparator: string;
  readonly coordinationNotes: readonly string[];
  readonly eval: typeof SPEC_TREE_GRAMMAR.EVAL;
  readonly probe: typeof SPEC_TREE_GRAMMAR.PROBE;
  readonly specFileSuffix: string;
};

const NAMING_SCHEMA_VERSION_ID = {
  PRE_3: "1.0.0",
  METHODOLOGY_3: "2.0.0",
  METHODOLOGY_4: "4.0.0",
} as const;

type NamingSchemaVersionForms = {
  readonly version: string;
  readonly methodologyLines: readonly string[];
  readonly nodeSuffixes: readonly string[];
  readonly productSuffix: string;
  readonly productKind?: ProductKind;
  readonly orderPattern: RegExp;
  readonly coordinationNotes: readonly string[];
  readonly specFileSuffix: string;
};

function namingSchemaVersion(forms: NamingSchemaVersionForms): NamingSchemaVersion {
  return {
    version: forms.version,
    methodologyLines: forms.methodologyLines,
    nodeSuffixes: forms.nodeSuffixes,
    decisionSuffixes: DECISION_SUFFIXES,
    productSuffix: forms.productSuffix,
    ...(forms.productKind === undefined ? {} : { productKind: forms.productKind }),
    evidence: SPEC_TREE_GRAMMAR.EVIDENCE,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order: { SEPARATOR: SPEC_TREE_GRAMMAR.ORDER.SEPARATOR, PATTERN: forms.orderPattern },
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: forms.coordinationNotes,
    eval: SPEC_TREE_GRAMMAR.EVAL,
    probe: SPEC_TREE_GRAMMAR.PROBE,
    specFileSuffix: forms.specFileSuffix,
  };
}

function kindSuffixes(kinds: readonly Kind[]): readonly string[] {
  return kinds.map((kind) => KIND_REGISTRY[kind].suffix);
}

export const SPEC_TREE_NAMING_SCHEMA_VERSIONS: readonly NamingSchemaVersion[] = [
  namingSchemaVersion({
    version: NAMING_SCHEMA_VERSION_ID.PRE_3,
    methodologyLines: [],
    nodeSuffixes: [...kindSuffixes([KIND_NAME.CAPABILITY]), ...SPEC_TREE_GRAMMAR.UNREGISTERED_NODE_SUFFIXES],
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    orderPattern: SPEC_TREE_GRAMMAR.ORDER.DIGIT_RUNS_PATTERN,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PLAIN_SUFFIX,
  }),
  namingSchemaVersion({
    version: NAMING_SCHEMA_VERSION_ID.METHODOLOGY_3,
    methodologyLines: [
      SPEC_TREE_METHODOLOGY_LINE.V3_0,
      SPEC_TREE_METHODOLOGY_LINE.V3_1,
      SPEC_TREE_METHODOLOGY_LINE.V3_2,
    ],
    nodeSuffixes: kindSuffixes([KIND_NAME.ENABLER, KIND_NAME.OUTCOME]),
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    orderPattern: SPEC_TREE_GRAMMAR.ORDER.DIGIT_RUNS_PATTERN,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PLAIN_SUFFIX,
  }),
  namingSchemaVersion({
    version: NAMING_SCHEMA_VERSION_ID.METHODOLOGY_4,
    methodologyLines: [SPEC_TREE_METHODOLOGY_LINE.V4_0],
    nodeSuffixes: kindSuffixes([KIND_NAME.PRODUCT, ...SPEC_TREE_OUTPUT_KIND_ORDER, KIND_NAME.VARIANT]),
    productSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.SPEC_DOCUMENT_SUFFIX,
    productKind: SPEC_TREE_PRODUCT_KIND,
    orderPattern: SPEC_TREE_GRAMMAR.ORDER.TWO_DIGIT_PATTERN,
    coordinationNotes: [SPEC_TREE_COORDINATION_NOTE.ISSUES],
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.SPEC_DOCUMENT_SUFFIX,
  }),
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

/** The newest member of a naming-schema version tuple under semantic-version ordering. */
export function newestNamingSchemaVersion(versions: readonly NamingSchemaVersion[]): NamingSchemaVersion {
  const first = versions.at(0);
  if (first === undefined) {
    throw new Error("Naming-schema version tuple must declare at least one version");
  }
  return versions.slice(1).reduce(
    (max, version) => (compareNamingSchemaVersions(version, max) > VERSION_ORDER_EQUAL ? version : max),
    first,
  );
}

/** The dedicated naming-schema version: the newest identifier of the version tuple. */
export const SPEC_TREE_NAMING_VERSION: string = newestNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).version;

export const SPEC_TREE_ENTRY_TYPE = {
  PRODUCT: SPEC_TREE_KIND_CATEGORY_VALUES.PRODUCT,
  NODE: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
  DECISION: SPEC_TREE_KIND_CATEGORY_VALUES.DECISION,
  EVIDENCE: "evidence",
  SUPERSEDED: "superseded",
  INVALID: "invalid",
} as const;

export type SpecTreeEntryType = (typeof SPEC_TREE_ENTRY_TYPE)[keyof typeof SPEC_TREE_ENTRY_TYPE];

export const SPEC_TREE_NODE_STATE = {
  DECLARED: "declared",
  SPECIFIED: "specified",
  FAILING: "failing",
  PASSING: "passing",
} as const;

export type SpecTreeNodeState = (typeof SPEC_TREE_NODE_STATE)[keyof typeof SPEC_TREE_NODE_STATE];

/**
 * The resolved `specTree` section, which presents the registry's kind definitions. A product
 * configuration file never supplies them: the methodology declaration selects the kinds a
 * read admits, so a `specTree.kinds` field fails resolution.
 */
export type SpecTreeConfig = {
  readonly [SPEC_TREE_CONFIG_FIELDS.KINDS]: typeof KIND_REGISTRY;
};

export const SPEC_TREE_SECTION = SPEC_TREE_CONFIG.SECTION;

/** Diagnostic for a `specTree.kinds` field, which no product configuration may carry. */
export function specTreeKindsFieldError(): string {
  return `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} is not a configuration field: the methodology declaration selects the kinds a read admits, and kind vocabulary is not configurable`;
}

const SPEC_TREE_DEFAULTS: SpecTreeConfig = { [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY };

function validate(value: unknown): Result<SpecTreeConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${SPEC_TREE_SECTION} section must be an object` };
  }
  if (Object.hasOwn(value, SPEC_TREE_CONFIG_FIELDS.KINDS)) {
    return { ok: false, error: specTreeKindsFieldError() };
  }
  return { ok: true, value: SPEC_TREE_DEFAULTS };
}

export const specTreeConfigDescriptor: ConfigDescriptor<SpecTreeConfig> = {
  section: SPEC_TREE_SECTION,
  defaults: SPEC_TREE_DEFAULTS,
  validate,
};
