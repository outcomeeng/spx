import * as fc from "fast-check";

import {
  DECISION_KINDS,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  SPEC_TREE_CONFIG,
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
};

export type KindRegistrySubsetCase = {
  readonly title: string;
  readonly category: SpecTreeKindCategory;
  readonly projectedKinds: readonly Kind[];
  readonly projectedSuffixes: readonly string[];
};

export type KindRegistryTypeCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly category: SpecTreeKindCategory;
};

export type KindRegistrySuffixCase = {
  readonly title: string;
  readonly kinds: readonly Kind[];
};

export const SPEC_TREE_CONFIG_VALIDATION_EXPECTATION = {
  ACCEPTED_SUBSET: "accepted-subset",
  UNKNOWN_KIND: "unknown-kind",
} as const;

export type SpecTreeConfigValidationCase =
  | {
    readonly title: string;
    readonly expectation: typeof SPEC_TREE_CONFIG_VALIDATION_EXPECTATION.ACCEPTED_SUBSET;
    readonly selectedKinds: readonly Kind[];
    readonly input: unknown;
  }
  | {
    readonly title: string;
    readonly expectation: typeof SPEC_TREE_CONFIG_VALIDATION_EXPECTATION.UNKNOWN_KIND;
    readonly offendingKind: string;
    readonly input: unknown;
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
  { name: "order pattern", size: SPEC_TREE_GRAMMAR.ORDER.PATTERN.source.length },
  { name: "path separator", size: SPEC_TREE_GRAMMAR.PATH_SEPARATOR.length },
  { name: "coordination notes", size: SPEC_TREE_GRAMMAR.COORDINATION_NOTES.length },
  { name: "eval directory", size: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME.length },
  { name: "eval files", size: SPEC_TREE_GRAMMAR.EVAL.FILES.length },
  { name: "eval runs directory", size: SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME.length },
  { name: "canonical spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX.length },
  { name: "prior spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length },
  { name: "prior node suffixes", size: SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length },
] as const satisfies readonly FilenameGrammarTokenCase[];

export function kindRegistryMappingCases(): readonly KindRegistryMappingCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => ({
    title: `maps ${kind} to one category and suffix`,
    kind,
  }));
}

export function kindRegistrySubsetCases(): readonly KindRegistrySubsetCase[] {
  return [SPEC_TREE_KIND_CATEGORY.NODE, SPEC_TREE_KIND_CATEGORY.DECISION].map((category) => {
    const projectedKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (kind) => KIND_REGISTRY[kind].category === category,
    );
    return {
      title: `projects the ${category} registry subset`,
      category,
      projectedKinds,
      projectedSuffixes: projectedKinds.map((kind) => KIND_REGISTRY[kind].suffix),
    };
  });
}

export function kindRegistryTypeCases(): readonly KindRegistryTypeCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => ({
    title: `projects the ${kind} runtime and type category`,
    kind,
    category: KIND_REGISTRY[kind].category,
  }));
}

export function kindRegistrySuffixCases(): readonly KindRegistrySuffixCase[] {
  return [
    { title: "keeps node suffixes unique", kinds: NODE_KINDS },
    { title: "keeps decision suffixes unique", kinds: DECISION_KINDS },
    { title: "keeps all registered suffixes unique", kinds: Object.keys(KIND_REGISTRY) as Kind[] },
  ];
}

export function specTreeConfigValidationCases(): readonly SpecTreeConfigValidationCase[] {
  const selectedKinds = [requireFirst(NODE_KINDS), requireFirst(DECISION_KINDS)];
  const offendingKind = sampleSpecTreeTestValue(
    SPEC_TREE_TEST_GENERATOR.sourceSlug().filter((kind) => !Object.hasOwn(KIND_REGISTRY, kind)),
  );
  return [
    {
      title: "accepts a source-owned subset of registered kinds",
      expectation: SPEC_TREE_CONFIG_VALIDATION_EXPECTATION.ACCEPTED_SUBSET,
      selectedKinds,
      input: { kinds: selectedKinds },
    },
    {
      title: "rejects a generated kind absent from the registry",
      expectation: SPEC_TREE_CONFIG_VALIDATION_EXPECTATION.UNKNOWN_KIND,
      offendingKind,
      input: { kinds: [offendingKind] },
    },
  ];
}

export function specTreeEntryRecognitionCases(): readonly SpecTreeEntryRecognitionCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => {
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const definition = KIND_REGISTRY[kind];
    if (definition.category === SPEC_TREE_KIND_CATEGORY.NODE) {
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
