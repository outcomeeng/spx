import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  NODE_SUFFIXES,
  OUTPUT_KINDS,
  OUTPUT_SUFFIXES,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  type SpecTreeFilesystemRecordType,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

export type FilenameGrammarTokenCase = {
  readonly name: string;
  readonly size: number;
};

export type KindRegistryMappingCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly suffixPattern: RegExp;
};

export type KindRegistrySubsetCase = {
  readonly title: string;
  readonly category: SpecTreeKindCategory;
  readonly projectedKinds: readonly Kind[];
  readonly projectedSuffixes: readonly string[];
  readonly exportedKinds: readonly Kind[];
  readonly exportedSuffixes: readonly string[];
};

export type KindRegistryTypeCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly category: SpecTreeKindCategory;
  readonly exportedKinds: readonly Kind[];
};

export type KindRegistrySuffixCase = {
  readonly title: string;
  readonly kinds: readonly Kind[];
};

export type SpecTreeKindsFieldCase = {
  readonly title: string;
  readonly config: Config;
};

export type SpecTreeEntryRecognitionCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly order: number;
  readonly slug: string;
  readonly parentId?: string;
  readonly recordType: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
};

export type EvidenceRecognitionCase = {
  readonly parentId: string;
  readonly relativePath: string;
};

export const FILENAME_GRAMMAR_TOKEN_CASES = [
  { name: "product suffix", size: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX.length },
  { name: "evidence directory", size: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME.length },
  { name: "evidence modes", size: SPEC_TREE_GRAMMAR.EVIDENCE.MODES.length },
  { name: "execution levels", size: SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS.length },
  { name: "language tails", size: Object.keys(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS).length },
  { name: "evidence segment separator", size: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR.length },
  { name: "runner tokens", size: SPEC_TREE_GRAMMAR.RUNNERS.length },
  { name: "order separator", size: SPEC_TREE_GRAMMAR.ORDER.SEPARATOR.length },
  { name: "order pattern", size: SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS.PATTERN.source.length },
  { name: "path separator", size: SPEC_TREE_GRAMMAR.PATH_SEPARATOR.length },
  { name: "coordination notes", size: SPEC_TREE_GRAMMAR.COORDINATION_NOTES.length },
  { name: "eval directory", size: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME.length },
  { name: "eval files", size: SPEC_TREE_GRAMMAR.EVAL.FILES.length },
  { name: "eval runs directory", size: SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME.length },
  { name: "canonical spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX.length },
  { name: "prior spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length },
  { name: "prior node suffixes", size: SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length },
] as const satisfies readonly FilenameGrammarTokenCase[];

const NODE_SUFFIX_SHAPE = /^\.[a-z-]+$/;
const DECISION_SUFFIX_SHAPE = /^\.[a-z-]+\.md$/;

const EXPORTED_KINDS_BY_CATEGORY: Readonly<Record<SpecTreeKindCategory, readonly Kind[]>> = {
  [SPEC_TREE_KIND_CATEGORY.NODE]: NODE_KINDS,
  [SPEC_TREE_KIND_CATEGORY.OUTPUT]: OUTPUT_KINDS,
  [SPEC_TREE_KIND_CATEGORY.DECISION]: DECISION_KINDS,
};

const EXPORTED_SUFFIXES_BY_CATEGORY: Readonly<Record<SpecTreeKindCategory, readonly string[]>> = {
  [SPEC_TREE_KIND_CATEGORY.NODE]: NODE_SUFFIXES,
  [SPEC_TREE_KIND_CATEGORY.OUTPUT]: OUTPUT_SUFFIXES,
  [SPEC_TREE_KIND_CATEGORY.DECISION]: DECISION_SUFFIXES,
};

export function kindRegistryMappingCases(): readonly KindRegistryMappingCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => ({
    title: `maps ${kind} to one category and suffix`,
    kind,
    suffixPattern: KIND_REGISTRY[kind].category === SPEC_TREE_KIND_CATEGORY.DECISION
      ? DECISION_SUFFIX_SHAPE
      : NODE_SUFFIX_SHAPE,
  }));
}

export function kindRegistrySubsetCases(): readonly KindRegistrySubsetCase[] {
  return [SPEC_TREE_KIND_CATEGORY.NODE, SPEC_TREE_KIND_CATEGORY.OUTPUT, SPEC_TREE_KIND_CATEGORY.DECISION].map(
    (category) => {
      const projectedKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
        (kind) => KIND_REGISTRY[kind].category === category,
      );
      return {
        title: `projects the ${category} registry subset`,
        category,
        projectedKinds,
        projectedSuffixes: projectedKinds.map((kind) => KIND_REGISTRY[kind].suffix),
        exportedKinds: EXPORTED_KINDS_BY_CATEGORY[category],
        exportedSuffixes: EXPORTED_SUFFIXES_BY_CATEGORY[category],
      };
    },
  );
}

export function kindRegistryTypeCases(): readonly KindRegistryTypeCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => ({
    title: `projects the ${kind} runtime and type category`,
    kind,
    category: KIND_REGISTRY[kind].category,
    exportedKinds: EXPORTED_KINDS_BY_CATEGORY[KIND_REGISTRY[kind].category],
  }));
}

export function kindRegistrySuffixCases(): readonly KindRegistrySuffixCase[] {
  return [
    { title: "keeps node suffixes unique", kinds: NODE_KINDS },
    { title: "keeps decision suffixes unique", kinds: DECISION_KINDS },
    { title: "keeps all registered suffixes unique", kinds: Object.keys(KIND_REGISTRY) as Kind[] },
  ];
}

/** A configuration that carries no `specTree` section, so the descriptor defaults apply. */
export function specTreeAbsentSectionConfig(): Config {
  return {};
}

/** One configuration per accepted shape of a `kinds` field: a list of kind names and a map of kind definitions. */
export function specTreeKindsFieldCases(): readonly SpecTreeKindsFieldCase[] {
  const kindNames = [requireFirst(NODE_KINDS), requireFirst(DECISION_KINDS)];
  return [
    {
      title: "rejects a kinds field listing registered kind names",
      config: { [SPEC_TREE_CONFIG.SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: kindNames } },
    },
    {
      title: "rejects a kinds field mapping registered kind names to their definitions",
      config: { [SPEC_TREE_CONFIG.SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: { ...KIND_REGISTRY } } },
    },
  ];
}

export function specTreeEntryRecognitionCases(): readonly SpecTreeEntryRecognitionCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => {
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const definition = KIND_REGISTRY[kind];
    if (definition.category !== SPEC_TREE_KIND_CATEGORY.DECISION) {
      return {
        title: `maps the registered ${kind} directory suffix`,
        kind,
        order,
        slug,
        recordType: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
        relativePath: `${order}-${slug}${definition.suffix}`,
      };
    }
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const parentId = `${parentOrder}-${parentSlug}${KIND_REGISTRY[requireFirst(NODE_KINDS)].suffix}`;
    return {
      title: `maps the registered ${kind} filename suffix`,
      kind,
      order,
      slug,
      parentId,
      recordType: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${parentId}/${order}-${slug}${definition.suffix}`,
    };
  });
}

export function arbitraryEvidenceRecognitionCase(): fc.Arbitrary<EvidenceRecognitionCase> {
  return fc
    .record({
      kind: fc.constantFrom(...NODE_KINDS),
      order: SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      slug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      evidenceFileName: SPEC_TREE_TEST_GENERATOR.evidenceFileName(),
    })
    .map(({ kind, order, slug, evidenceFileName }) => {
      const parentId = `${order}-${slug}${KIND_REGISTRY[kind].suffix}`;
      return {
        parentId,
        relativePath: [parentId, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFileName].join(
          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
        ),
      };
    });
}

export function productEntryRecognitionCase(): {
  readonly slug: string;
  readonly relativePath: string;
} {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  return { slug, relativePath: `${slug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}` };
}

function requireFirst<T>(values: readonly T[]): T {
  const first = values[0];
  if (first === undefined) throw new Error("Expected a non-empty source-owned registry projection");
  return first;
}
