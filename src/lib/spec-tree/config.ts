import type { ConfigDescriptor, Result } from "@/config/types";

const SPEC_TREE_KIND_CATEGORY_VALUES = {
  NODE: "node",
  OUTPUT: "output",
  DECISION: "decision",
} as const;

const SPEC_TREE_EMPTY_ALIASES = [] as const;

/** The value a variant declares for its opening and admitted children: both resolve through its parent's kind. */
export const SPEC_TREE_INHERIT_FROM_PARENT = "inherit" as const;

export const SPEC_TREE_CONFIG = {
  SECTION: "specTree",
  ROOT_DIRECTORY: "spx",
  PRODUCT: {
    LABEL: "Product",
    SUFFIX: ".product.md",
    KIND: "product",
    /** The directory suffix of a nested product scope, which holds children without being a registered node kind. */
    NODE_SUFFIX: ".product",
    /** The kinds a product admits as children: the 4.0 output kinds a variant does not take the place of, and a nested product. */
    CHILDREN: ["substrate", "capability", "domain", "interface", "surface", "product"],
  },
  CATEGORY: SPEC_TREE_KIND_CATEGORY_VALUES,
  KINDS: {
    enabler: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Enabler",
      suffix: ".enabler",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "PROVIDES",
      children: ["enabler"],
    },
    outcome: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.NODE,
      label: "Outcome",
      suffix: ".outcome",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "WE BELIEVE THAT",
      children: ["enabler", "outcome"],
    },
    substrate: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Substrate",
      suffix: ".substrate",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "SUPPLIES",
      children: ["substrate", "variant"],
    },
    capability: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Capability",
      suffix: ".capability",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "PROVIDES",
      children: ["substrate", "capability", "variant"],
    },
    domain: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Domain",
      suffix: ".domain",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "OWNS",
      children: ["substrate", "capability", "domain", "variant"],
    },
    interface: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Interface",
      suffix: ".interface",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "ADAPTS",
      children: ["substrate", "capability", "domain", "interface", "variant"],
    },
    surface: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Surface",
      suffix: ".surface",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: "EXPOSES",
      children: ["substrate", "capability", "domain", "interface", "surface", "variant"],
    },
    variant: {
      category: SPEC_TREE_KIND_CATEGORY_VALUES.OUTPUT,
      label: "Variant",
      suffix: ".variant",
      aliases: SPEC_TREE_EMPTY_ALIASES,
      opening: SPEC_TREE_INHERIT_FROM_PARENT,
      children: SPEC_TREE_INHERIT_FROM_PARENT,
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

/** A kind of the 3.x grammar's node vocabulary. */
export type NodeKind = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends typeof SPEC_TREE_KIND_CATEGORY.NODE ? K : never;
}[Kind];

/** A kind of the 4.0 grammar's output-node vocabulary. */
export type OutputKind = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends typeof SPEC_TREE_KIND_CATEGORY.OUTPUT ? K : never;
}[Kind];

/** Every kind a node directory carries, across the grammars SPX reads. */
export type SpecTreeNodeKind = NodeKind | OutputKind;

/** The kind of a product scope, which holds children without being a registered node kind. */
export type ProductKind = typeof SPEC_TREE_CONFIG.PRODUCT.KIND;

/** Every kind that holds children, and every kind a container admits as a child: a node kind or a product. */
export type SpecTreeContainerKind = SpecTreeNodeKind | ProductKind;

export type DecisionKind = {
  [K in Kind]: (typeof KIND_REGISTRY)[K]["category"] extends typeof SPEC_TREE_KIND_CATEGORY.DECISION ? K : never;
}[Kind];

export const SPEC_TREE_ADR_KIND: DecisionKind = "adr";

/**
 * The opening keyword a node kind resolves: its own, or its parent's when the kind inherits it.
 * A kind that inherits with no parent kind, or whose parent resolves none, resolves none.
 */
export function resolveKindOpening(kind: SpecTreeNodeKind, parentKind?: SpecTreeNodeKind): string | undefined {
  const opening: string = KIND_REGISTRY[kind].opening;
  if (opening !== SPEC_TREE_INHERIT_FROM_PARENT) return opening;
  return parentKind === undefined ? undefined : resolveKindOpening(parentKind);
}

/** The label a container kind carries: a node kind's registered label, or the product label. */
export function resolveKindLabel(kind: SpecTreeContainerKind): string {
  return kind === SPEC_TREE_CONFIG.PRODUCT.KIND ? SPEC_TREE_CONFIG.PRODUCT.LABEL : KIND_REGISTRY[kind].label;
}

/**
 * The kinds a container kind admits as children: a product's, a node kind's own, or its parent's
 * when the kind inherits them, excluding a further variant.
 */
export function resolveAdmittedChildren(
  kind: SpecTreeContainerKind,
  parentKind?: SpecTreeNodeKind,
): readonly SpecTreeContainerKind[] | undefined {
  if (kind === SPEC_TREE_CONFIG.PRODUCT.KIND) return SPEC_TREE_CONFIG.PRODUCT.CHILDREN;
  const children: readonly string[] | typeof SPEC_TREE_INHERIT_FROM_PARENT = KIND_REGISTRY[kind].children;
  if (children !== SPEC_TREE_INHERIT_FROM_PARENT) return children as readonly SpecTreeContainerKind[];
  if (parentKind === undefined) return undefined;
  return resolveAdmittedChildren(parentKind)?.filter((child) => child !== kind);
}

export const NODE_KINDS: readonly NodeKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is NodeKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.NODE,
);

export const DECISION_KINDS: readonly DecisionKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is DecisionKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.DECISION,
);

export const OUTPUT_KINDS: readonly OutputKind[] = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
  (k): k is OutputKind => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.OUTPUT,
);

export const NODE_SUFFIXES: readonly string[] = NODE_KINDS.map((k) => KIND_REGISTRY[k].suffix);
export const OUTPUT_SUFFIXES: readonly string[] = OUTPUT_KINDS.map((k) => KIND_REGISTRY[k].suffix);
export const DECISION_SUFFIXES: readonly string[] = DECISION_KINDS.map((k) => KIND_REGISTRY[k].suffix);

/** The coordination notes a node may carry, each named once; the grammar lists them as `COORDINATION_NOTES`. */
export const SPEC_TREE_COORDINATION_NOTE = {
  PLAN: "PLAN.md",
  ISSUES: "ISSUES.md",
} as const;

const SPEC_TREE_ORDER_SEPARATOR_TOKEN = "-";

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
    TEST_MARKER: "test",
    AFFIX_SEPARATOR: "_",
    WORD_SEPARATOR: "-",
    WORD_PATTERN: /^[a-z][a-z0-9]*$/,
  },
  RUNNERS: ["vitest", "playwright", "subprocess"],
  ORDER: {
    SEPARATOR: SPEC_TREE_ORDER_SEPARATOR_TOKEN,
    /** Separates the numeric segments of one index, as in `20.10`. */
    SEGMENT_SEPARATOR: ".",
  },
  /** The index form each naming-schema era accepts: dot-separated digit runs, or two-digit integers with two-digit fractions. */
  ORDER_FORMS: {
    DIGIT_RUNS: { SEPARATOR: SPEC_TREE_ORDER_SEPARATOR_TOKEN, PATTERN: /^\d+(\.\d+)*$/ },
    TWO_DIGIT: { SEPARATOR: SPEC_TREE_ORDER_SEPARATOR_TOKEN, PATTERN: /^[1-9]\d(\.\d{2})*$/ },
  },
  PATH_SEPARATOR: "/",
  COORDINATION_NOTE: SPEC_TREE_COORDINATION_NOTE,
  COORDINATION_NOTES: [SPEC_TREE_COORDINATION_NOTE.PLAN, SPEC_TREE_COORDINATION_NOTE.ISSUES],
  GUIDE_FILES: ["CLAUDE.md", "AGENTS.md"],
  STATUS_FILENAME: "spx.status.json",
  KNOWLEDGE: {
    DIRECTORY_NAME: "knowledge",
    INDEX_FILENAME: "index.md",
    LOG_FILENAME: "log.md",
  },
  OUTCOME_RECORD: {
    SUFFIX: ".outcome.md",
  },
  LOCAL_OVERLAYS: {
    DIRECTORY_NAME: "local",
    LIFECYCLE_FILENAME: "merging.md",
    EXTENSION: ".md",
  },
  EVAL: {
    DIRECTORY_NAME: "evals",
    FILES: ["eval.toml", "cases.jsonl", "prompt.md", "prompt.template.md", "history.jsonl"],
    RUNS_DIRECTORY_NAME: "runs",
  },
  PROBE: {
    DIRECTORY_NAME: "probes",
    PROTOCOL_FILENAME: "probe.md",
    RUNS_DIRECTORY_NAME: "runs",
  },
  SPEC_FILE: {
    CANONICAL_SUFFIX: ".spec.md",
    PRIOR_SUFFIX: ".md",
  },
  PRIOR_NODE_SUFFIXES: [".feature", ".story"],
} as const;

export const SPEC_TREE_EVIDENCE_FILE = SPEC_TREE_GRAMMAR.EVIDENCE;

export type SpecTreeEvidenceGrammar = {
  readonly DIRECTORY_NAME: string;
  readonly MODES: readonly string[];
  readonly LEVELS: readonly string[];
  readonly TAILS: Readonly<Record<string, readonly string[]>>;
  readonly SEGMENT_SEPARATOR: string;
  readonly TEST_MARKER: string;
  readonly AFFIX_SEPARATOR: string;
  readonly WORD_SEPARATOR: string;
  readonly WORD_PATTERN: RegExp;
};
export type SpecTreeOrderGrammar = {
  readonly SEPARATOR: string;
  readonly PATTERN: RegExp;
};

/** The methodology lines SPX reads, each as `MAJOR.MINOR`. */
export const SPEC_TREE_METHODOLOGY_LINE = {
  THREE_ZERO: "3.0",
  THREE_ONE: "3.1",
  THREE_TWO: "3.2",
  FOUR_ZERO: "4.0",
} as const;

export type SpecTreeMethodologyLine = (typeof SPEC_TREE_METHODOLOGY_LINE)[keyof typeof SPEC_TREE_METHODOLOGY_LINE];

export type NamingSchemaVersion = {
  readonly version: string;
  /** The methodology lines this version serves; none for the version of the era before 3.0. */
  readonly lines: readonly SpecTreeMethodologyLine[];
  readonly nodeSuffixes: readonly string[];
  readonly decisionSuffixes: readonly string[];
  readonly productSuffix: string;
  readonly evidence: SpecTreeEvidenceGrammar;
  readonly runners: readonly string[];
  readonly order: SpecTreeOrderGrammar;
  readonly pathSeparator: string;
  readonly coordinationNotes: readonly string[];
  readonly eval: typeof SPEC_TREE_GRAMMAR.EVAL;
  /** The knowledge root a node may hold; absent for a version that reserves no such directory. */
  readonly knowledge?: typeof SPEC_TREE_GRAMMAR.KNOWLEDGE;
  /** The probe lane a node may hold; absent for a version that reserves no such directory. */
  readonly probe?: typeof SPEC_TREE_GRAMMAR.PROBE;
  readonly specFileSuffix: string;
  /** The kind a root spec file declares in its front matter; absent when the root is a `productSuffix` file with no declared kind. */
  readonly rootSpecKind?: string;
};

const NAMING_SCHEMA_VERSION_ID = {
  PRIOR_NODES: "1.0.0",
  CANONICAL: "3.0.0",
  OUTPUT_NODES: "4.0.0",
} as const;

function namingSchemaVersion(
  version: string,
  lines: readonly SpecTreeMethodologyLine[],
  nodeSuffixes: readonly string[],
  specFileSuffix: string,
  order: SpecTreeOrderGrammar,
): NamingSchemaVersion {
  return {
    version,
    lines,
    nodeSuffixes,
    decisionSuffixes: DECISION_SUFFIXES,
    productSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    evidence: SPEC_TREE_GRAMMAR.EVIDENCE,
    runners: SPEC_TREE_GRAMMAR.RUNNERS,
    order,
    pathSeparator: SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    coordinationNotes: SPEC_TREE_GRAMMAR.COORDINATION_NOTES,
    eval: SPEC_TREE_GRAMMAR.EVAL,
    specFileSuffix,
  };
}

export const SPEC_TREE_NAMING_SCHEMA_VERSIONS: readonly NamingSchemaVersion[] = [
  namingSchemaVersion(
    NAMING_SCHEMA_VERSION_ID.PRIOR_NODES,
    [],
    [...SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES, KIND_REGISTRY.capability.suffix],
    SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
    SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS,
  ),
  namingSchemaVersion(
    NAMING_SCHEMA_VERSION_ID.CANONICAL,
    [SPEC_TREE_METHODOLOGY_LINE.THREE_ZERO, SPEC_TREE_METHODOLOGY_LINE.THREE_ONE, SPEC_TREE_METHODOLOGY_LINE.THREE_TWO],
    NODE_SUFFIXES,
    SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
    SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS,
  ),
];

/**
 * The 4.0 grammar: output-node directories, `{slug}.spec.md` specs, and a root spec
 * that declares the product kind in its front matter.
 */
export const SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION: NamingSchemaVersion = {
  ...namingSchemaVersion(
    NAMING_SCHEMA_VERSION_ID.OUTPUT_NODES,
    [SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO],
    [...OUTPUT_SUFFIXES, SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX],
    SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    SPEC_TREE_GRAMMAR.ORDER_FORMS.TWO_DIGIT,
  ),
  productSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
  coordinationNotes: [SPEC_TREE_COORDINATION_NOTE.ISSUES],
  knowledge: SPEC_TREE_GRAMMAR.KNOWLEDGE,
  probe: SPEC_TREE_GRAMMAR.PROBE,
  rootSpecKind: SPEC_TREE_CONFIG.PRODUCT.KIND,
};

/** Every naming-schema version SPX knows, prior to the selection a methodology declaration makes. */
export const SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS: readonly NamingSchemaVersion[] = [
  ...SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
];

/** Whether a version accepts `name` as a note a node directory holds beside its spec. */
export function acceptsNodeLocalNote(version: NamingSchemaVersion, name: string): boolean {
  return version.coordinationNotes.includes(name);
}

/** The kind of filesystem entry a path under a node's eval directory names. */
export const SPEC_TREE_EVAL_ENTRY_KIND = {
  FILE: "file",
  DIRECTORY: "directory",
} as const;

export type SpecTreeEvalEntryKind = (typeof SPEC_TREE_EVAL_ENTRY_KIND)[keyof typeof SPEC_TREE_EVAL_ENTRY_KIND];

/** The segments of an eval-lane entry's path from its node: `evals`, the rule slug, and the entry name. */
const EVAL_LANE_PATH_SEGMENT_COUNT = 3;

/**
 * Whether a version accepts the entry at `pathFromNode`, a path relative to a node directory
 * joined by the version's path separator, as eval-lane content: a file the version lists, or its
 * runs directory, directly under `evals/{rule-slug}/`.
 */
export function acceptsEvalLaneEntry(
  version: NamingSchemaVersion,
  pathFromNode: string,
  entryKind: SpecTreeEvalEntryKind,
): boolean {
  const segments = pathFromNode.split(version.pathSeparator);
  if (segments.length !== EVAL_LANE_PATH_SEGMENT_COUNT) return false;
  const [directory, ruleSlug, name] = segments;
  if (directory !== version.eval.DIRECTORY_NAME || ruleSlug === "") return false;
  return entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY
    ? name === version.eval.RUNS_DIRECTORY_NAME
    : (version.eval.FILES as readonly string[]).includes(name);
}

/** The segments of a probe-lane artifact's name: `{slug}` and `{ext}`, joined by the evidence segment separator. */
const PROBE_ARTIFACT_NAME_SEGMENT_COUNT = 2;

/** The segments of a probe-lane path that name the lane directory alone, a probe directory, or an entry in a probe directory. */
const PROBE_LANE_PATH_SEGMENT_COUNT = 1;
const PROBE_DIRECTORY_PATH_SEGMENT_COUNT = 2;
const PROBE_ENTRY_PATH_SEGMENT_COUNT = 3;

function isGrammarSlug(text: string, evidence: SpecTreeEvidenceGrammar): boolean {
  return text.split(evidence.WORD_SEPARATOR).every((word) => evidence.WORD_PATTERN.test(word));
}

/**
 * Whether a version accepts the entry at `pathFromNode`, a path relative to the directory that holds
 * the knowledge root joined by the version's path separator: the `knowledge` directory itself, or
 * anything beneath it, whose structure the bundle's author owns. A version that reserves no
 * knowledge root accepts nothing.
 */
export function acceptsKnowledgeRoot(
  version: NamingSchemaVersion,
  pathFromNode: string,
  entryKind: SpecTreeEvalEntryKind,
): boolean {
  if (version.knowledge === undefined) return false;
  const [root, ...beneath] = pathFromNode.split(version.pathSeparator);
  if (root !== version.knowledge.DIRECTORY_NAME) return false;
  if (beneath.length === 0) return entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY;
  return beneath.every((segment) => segment !== "");
}

/**
 * Whether a version accepts the entry at `pathFromNode`, a path relative to a node directory joined
 * by the version's path separator, as probe-lane content: the `probes` directory, a directory named
 * by a slug beneath it, and beneath that directory the protocol file, an artifact file
 * `{slug}.{ext}`, or the runs directory. A version that reserves no probe lane accepts nothing.
 */
export function acceptsProbeEntry(
  version: NamingSchemaVersion,
  pathFromNode: string,
  entryKind: SpecTreeEvalEntryKind,
): boolean {
  if (version.probe === undefined) return false;
  const segments = pathFromNode.split(version.pathSeparator);
  const [directory, probeSlug = "", name = ""] = segments;
  if (directory !== version.probe.DIRECTORY_NAME) return false;
  const isDirectory = entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY;
  if (segments.length === PROBE_LANE_PATH_SEGMENT_COUNT) return isDirectory;
  if (!isGrammarSlug(probeSlug, version.evidence)) return false;
  if (segments.length === PROBE_DIRECTORY_PATH_SEGMENT_COUNT) return isDirectory;
  if (segments.length !== PROBE_ENTRY_PATH_SEGMENT_COUNT) return false;
  if (isDirectory) return name === version.probe.RUNS_DIRECTORY_NAME;
  const artifact = name.split(version.evidence.SEGMENT_SEPARATOR);
  const [artifactSlug = "", extension = ""] = artifact;
  return artifact.length === PROBE_ARTIFACT_NAME_SEGMENT_COUNT
    && isGrammarSlug(artifactSlug, version.evidence)
    && version.evidence.WORD_PATTERN.test(extension);
}

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

export const SPEC_TREE_NAMING_VERSION: string =
  canonicalNamingSchemaVersion(SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS).version;

export const SPEC_TREE_ENTRY_TYPE = {
  PRODUCT: "product",
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

/** The resolved spec-tree section: it carries no fields, because the kind registry is fixed. */
export type SpecTreeConfig = Readonly<Record<string, never>>;

export const SPEC_TREE_SECTION = SPEC_TREE_CONFIG.SECTION;

function buildDefaults(): SpecTreeConfig {
  return {};
}

function validate(value: unknown): Result<SpecTreeConfig> {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: `${SPEC_TREE_SECTION} section must be an object` };
  }
  if (Object.hasOwn(value, SPEC_TREE_CONFIG_FIELDS.KINDS)) {
    return {
      ok: false,
      error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} is not configurable; the kind registry is fixed`,
    };
  }
  return { ok: true, value: buildDefaults() };
}

export const specTreeConfigDescriptor: ConfigDescriptor<SpecTreeConfig> = {
  section: SPEC_TREE_SECTION,
  defaults: buildDefaults(),
  validate,
};
