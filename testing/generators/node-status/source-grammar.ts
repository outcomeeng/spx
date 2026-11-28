/**
 * Generators of source-grammar nodes: a node whose spec is written in the 3.x grammar of a product migrating to
 * 4.0, with one Assertion closed by an audit-tag form, a declared Malleability or none, and one linked test.
 *
 * @module testing/generators/node-status/source-grammar
 */
import * as fc from "fast-check";

import { NODE_STATUS_MALLEABILITY, type NodeStatusMalleability } from "@/lib/node-status";
import {
  SPEC_TREE_AUDIT_LINK,
  SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR,
  SPEC_TREE_AUDIT_TAG_TEXT,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { NODE_STATUS_READABLE_SLUGS } from "@testing/generators/node-status/node-status";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";

const SOURCE_GRAMMAR_ORDER = { MIN: 10, MAX: 99 } as const;

/** The audit-tag forms a source-grammar Assertion closes with: none, a linked audit tag, and the two pathless tags. */
export const SOURCE_GRAMMAR_AUDIT_TAG_FORM = {
  NONE: "none",
  LINKED: "linked",
  PATHLESS_REVIEW: "pathless-review",
  PATHLESS_AUDIT: "pathless-audit",
} as const;

export type SourceGrammarAuditTagForm =
  (typeof SOURCE_GRAMMAR_AUDIT_TAG_FORM)[keyof typeof SOURCE_GRAMMAR_AUDIT_TAG_FORM];

/** The Malleabilities a source-grammar spec declares; `undefined` declares none, which reads as `implementation`. */
export const SOURCE_GRAMMAR_MALLEABILITIES: readonly (NodeStatusMalleability | undefined)[] = [
  NODE_STATUS_MALLEABILITY.SPEC,
  NODE_STATUS_MALLEABILITY.VERIFICATION,
  NODE_STATUS_MALLEABILITY.IMPLEMENTATION,
  undefined,
];

/** The methodology declarations a source-grammar node repository is committed under. */
export const SOURCE_GRAMMAR_DECLARATION = {
  /** 4.0 migrating from 3.2: the spec is written in the migration source's grammar. */
  MIGRATING_FROM_THREE_TWO: "4.0, migrating from 3.2",
  /** 4.0 with no migration source: the 3.x tags of the spec are no grammar the read selects. */
  FOUR_ZERO: "4.0",
} as const;

export type SourceGrammarDeclaration = (typeof SOURCE_GRAMMAR_DECLARATION)[keyof typeof SOURCE_GRAMMAR_DECLARATION];

/** The facts a source-grammar node's spec is materialized from. */
export type SourceGrammarNodeFacts = {
  readonly auditTagForm: SourceGrammarAuditTagForm;
  /** The Malleability the spec's front matter declares; `undefined` when it declares none. */
  readonly malleability: NodeStatusMalleability | undefined;
};

/** A generated source-grammar node: its index, slug, audit rule slug, test subject name, and spec facts. */
export type SourceGrammarNodeFixture = {
  readonly order: number;
  readonly slug: string;
  /** The rule slug a linked audit tag names; distinct from the node slug and the subject name. */
  readonly auditSlug: string;
  /** The name of the source file the node's linked test exercises. */
  readonly subjectName: string;
  readonly facts: SourceGrammarNodeFacts;
};

/** A source-grammar node and the declaration its repository is committed under. */
export type SourceGrammarNodeRepositoryFixture = {
  readonly node: SourceGrammarNodeFixture;
  readonly declaration: SourceGrammarDeclaration;
};

/** The methodology section a declaration names: each version drawn in either accepted form. */
export type SourceGrammarMethodologyDeclaration = {
  readonly version: string;
  readonly migratingFrom?: string;
};

export const SOURCE_GRAMMAR_TEST_GENERATOR = {
  node: arbitrarySourceGrammarNode,
  nodeRepository: arbitrarySourceGrammarNodeRepository,
  methodologyDeclaration: arbitraryMethodologyDeclaration,
  tagOutsideAssertion: arbitraryTagOutsideAssertionScenario,
} as const;

/** Every combination of an audit-tag form and a declared Malleability, each exactly once. */
export function enumerateSourceGrammarNodeFacts(): readonly SourceGrammarNodeFacts[] {
  return Object.values(SOURCE_GRAMMAR_AUDIT_TAG_FORM).flatMap((auditTagForm) =>
    SOURCE_GRAMMAR_MALLEABILITIES.map((malleability) => ({ auditTagForm, malleability }))
  );
}

function arbitrarySourceGrammarNodeFacts(): fc.Arbitrary<SourceGrammarNodeFacts> {
  return fc.record({
    auditTagForm: fc.constantFrom(...Object.values(SOURCE_GRAMMAR_AUDIT_TAG_FORM)),
    malleability: fc.constantFrom(...SOURCE_GRAMMAR_MALLEABILITIES),
  });
}

/** A source-grammar node with facts drawn from their whole domain, or with the given facts. */
function arbitrarySourceGrammarNode(facts?: SourceGrammarNodeFacts): fc.Arbitrary<SourceGrammarNodeFixture> {
  return fc
    .record({
      order: fc.integer({ min: SOURCE_GRAMMAR_ORDER.MIN, max: SOURCE_GRAMMAR_ORDER.MAX }),
      slugs: fc.uniqueArray(fc.constantFrom(...NODE_STATUS_READABLE_SLUGS), { minLength: 3, maxLength: 3 }),
      facts: facts === undefined ? arbitrarySourceGrammarNodeFacts() : fc.constant(facts),
    })
    .map(({ order, slugs: [slug = "", auditSlug = "", subjectName = ""], facts: drawn }) => ({
      order,
      slug,
      auditSlug,
      subjectName,
      facts: drawn,
    }));
}

/** A source-grammar node repository: a drawn node, or one of the given facts, under a drawn or given declaration. */
function arbitrarySourceGrammarNodeRepository(
  options: { readonly facts?: SourceGrammarNodeFacts; readonly declaration?: SourceGrammarDeclaration } = {},
): fc.Arbitrary<SourceGrammarNodeRepositoryFixture> {
  return fc.record({
    node: arbitrarySourceGrammarNode(options.facts),
    declaration: options.declaration === undefined
      ? fc.constantFrom(...Object.values(SOURCE_GRAMMAR_DECLARATION))
      : fc.constant(options.declaration),
  });
}

/** The methodology section of a declaration, its versions on the lines the declaration names. */
function arbitraryMethodologyDeclaration(
  declaration: SourceGrammarDeclaration,
): fc.Arbitrary<SourceGrammarMethodologyDeclaration> {
  const fourZero = arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
  return declaration === SOURCE_GRAMMAR_DECLARATION.FOUR_ZERO
    ? fourZero.map((version) => ({ version }))
    : fc
      .tuple(fourZero, arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO))
      .map(([version, migratingFrom]) => ({ version, migratingFrom }));
}

/** The spellings of an audit or review tag that closes a 3.x Assertion: linked, slugged, and the two pathless tags. */
export const AUDIT_TAG_SPELLING = {
  LINKED: "linked",
  SLUGGED: "slugged",
  PATHLESS_AUDIT: "pathless-audit",
  PATHLESS_REVIEW: "pathless-review",
} as const;

export type AuditTagSpelling = (typeof AUDIT_TAG_SPELLING)[keyof typeof AUDIT_TAG_SPELLING];

/** The spelling each audit-tag form of a source-grammar node closes its Assertion with, or none. */
const SPELLING_OF_FORM: Readonly<Record<SourceGrammarAuditTagForm, AuditTagSpelling | undefined>> = {
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE]: undefined,
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.LINKED]: AUDIT_TAG_SPELLING.LINKED,
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_REVIEW]: AUDIT_TAG_SPELLING.PATHLESS_REVIEW,
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_AUDIT]: AUDIT_TAG_SPELLING.PATHLESS_AUDIT,
};

/** The tag text of `spelling`, naming `ruleSlug` where the spelling carries one. */
export function auditTagText(spelling: AuditTagSpelling, ruleSlug: string): string {
  switch (spelling) {
    case AUDIT_TAG_SPELLING.LINKED:
      return `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}](${SPEC_TREE_AUDIT_LINK.DIRECTORY_NAME}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${ruleSlug}${SPEC_TREE_AUDIT_LINK.EXTENSION})`;
    case AUDIT_TAG_SPELLING.SLUGGED:
      return `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}${SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR}${ruleSlug}]`;
    case AUDIT_TAG_SPELLING.PATHLESS_AUDIT:
      return `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}]`;
    case AUDIT_TAG_SPELLING.PATHLESS_REVIEW:
      return `[${SPEC_TREE_AUDIT_TAG_TEXT.LEGACY}]`;
  }
}

/** The tag text a source-grammar node's audit-tag form closes its Assertion with, or none for the form `none`. */
export function sourceGrammarAuditTagText(form: SourceGrammarAuditTagForm, ruleSlug: string): string | undefined {
  const spelling = SPELLING_OF_FORM[form];
  return spelling === undefined ? undefined : auditTagText(spelling, ruleSlug);
}

/** The heading and Assertion text a 3.x group of tagged Assertions takes. */
const TAGGED_GROUP = {
  HEADING: "### Compliance",
  ASSERTION: "- ALWAYS: the rule holds",
} as const;

/** The Assertion lines of a 3.x group holding one Assertion closed by `tag`. */
export function taggedAssertionLines(tag: string): readonly string[] {
  return [TAGGED_GROUP.HEADING, "", `${TAGGED_GROUP.ASSERTION} (${tag})`];
}

/** One row of the `audit-entry-key` Mapping: the Assertion lines of the node's spec and the keys of its `audit` entries. */
export type AuditEntryKeyCase = {
  readonly label: string;
  readonly assertionLines: readonly string[];
  readonly expectedKeys: readonly string[];
};

/** The rows of the `audit-entry-key` Mapping, each keyed audit reference naming `ruleSlug`. */
export function auditEntryKeyCases(ruleSlug: string): readonly AuditEntryKeyCase[] {
  return [
    {
      label: "audit-row",
      assertionLines: ["### Audit: messages", "", `- ${ruleSlug}: ALWAYS: the message names the line.`],
      expectedKeys: [ruleSlug],
    },
    {
      label: "linked-audit-tag",
      assertionLines: taggedAssertionLines(auditTagText(AUDIT_TAG_SPELLING.LINKED, ruleSlug)),
      expectedKeys: [ruleSlug],
    },
    {
      label: "slugged-audit-tag",
      assertionLines: taggedAssertionLines(auditTagText(AUDIT_TAG_SPELLING.SLUGGED, ruleSlug)),
      expectedKeys: [ruleSlug],
    },
    {
      label: "test-row",
      assertionLines: ["### Test.Compliance: capture", "", "- line-verbatim: NEVER: a task drops a character."],
      expectedKeys: [],
    },
    {
      label: "unslugged-audit-row",
      assertionLines: ["### Audit", "", "- ALWAYS: the message names the line."],
      expectedKeys: [],
    },
    {
      label: "pathless-tag",
      assertionLines: taggedAssertionLines(auditTagText(AUDIT_TAG_SPELLING.PATHLESS_AUDIT, ruleSlug)),
      expectedKeys: [],
    },
  ];
}

/** How a case names a declared Malleability, `none declared` for a spec that declares none. */
export function declaredMalleabilityLabel(malleability: NodeStatusMalleability | undefined): string {
  return malleability ?? NONE_DECLARED;
}

const NONE_DECLARED = "none declared";

/** The State the 4.0 rule gives a source-grammar node of each audit-tag form at each declared Malleability. */
const MIGRATION_SOURCE_STATE: Readonly<
  Record<SourceGrammarAuditTagForm, Readonly<Record<NodeStatusMalleability | typeof NONE_DECLARED, SpecTreeNodeState>>>
> = {
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE]: {
    [NODE_STATUS_MALLEABILITY.SPEC]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.VERIFICATION]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.IMPLEMENTATION]: SPEC_TREE_NODE_STATE.PASSING,
    [NONE_DECLARED]: SPEC_TREE_NODE_STATE.PASSING,
  },
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.LINKED]: {
    [NODE_STATUS_MALLEABILITY.SPEC]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.VERIFICATION]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.IMPLEMENTATION]: SPEC_TREE_NODE_STATE.PASSING,
    [NONE_DECLARED]: SPEC_TREE_NODE_STATE.PASSING,
  },
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_REVIEW]: {
    [NODE_STATUS_MALLEABILITY.SPEC]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.VERIFICATION]: SPEC_TREE_NODE_STATE.SPECIFIED,
    [NODE_STATUS_MALLEABILITY.IMPLEMENTATION]: SPEC_TREE_NODE_STATE.SPECIFIED,
    [NONE_DECLARED]: SPEC_TREE_NODE_STATE.SPECIFIED,
  },
  [SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_AUDIT]: {
    [NODE_STATUS_MALLEABILITY.SPEC]: SPEC_TREE_NODE_STATE.PASSING,
    [NODE_STATUS_MALLEABILITY.VERIFICATION]: SPEC_TREE_NODE_STATE.SPECIFIED,
    [NODE_STATUS_MALLEABILITY.IMPLEMENTATION]: SPEC_TREE_NODE_STATE.SPECIFIED,
    [NONE_DECLARED]: SPEC_TREE_NODE_STATE.SPECIFIED,
  },
};

/** One cell of the `migration-source-state` Mapping: the node's facts and the State the 4.0 rule gives it. */
export type MigrationSourceStateCase = SourceGrammarNodeFacts & {
  readonly declared: string;
  readonly expected: SpecTreeNodeState;
};

/** Every cell of the `migration-source-state` Mapping, one per audit-tag form and declared Malleability. */
export function migrationSourceStateCases(): readonly MigrationSourceStateCase[] {
  return enumerateSourceGrammarNodeFacts().map((facts) => ({
    ...facts,
    declared: declaredMalleabilityLabel(facts.malleability),
    expected: MIGRATION_SOURCE_STATE[facts.auditTagForm][facts.malleability ?? NONE_DECLARED],
  }));
}

/** One case of `tags-unread-without-source`: a tag spelling at a declared Malleability. */
export type TagsWithoutSourceCase = {
  readonly spelling: AuditTagSpelling;
  readonly malleability: NodeStatusMalleability | undefined;
  readonly declared: string;
};

/** Every tag spelling at every declared Malleability, each exactly once. */
export function tagsWithoutSourceCases(): readonly TagsWithoutSourceCase[] {
  return Object.values(AUDIT_TAG_SPELLING).flatMap((spelling) =>
    SOURCE_GRAMMAR_MALLEABILITIES.map((malleability) => ({
      spelling,
      malleability,
      declared: declaredMalleabilityLabel(malleability),
    }))
  );
}

/**
 * The `tag-outside-assertion` spec: an Assertion closed by an audit tag of `keyedSlug`, an Assertion that quotes an
 * audit tag of another slug in a code span, and a paragraph after the Assertions section with an audit tag of a third.
 */
export type TagOutsideAssertionScenario = {
  readonly keyedSlug: string;
  readonly assertionLines: readonly string[];
  readonly trailingLines: readonly string[];
};

function arbitraryTagOutsideAssertionScenario(): fc.Arbitrary<TagOutsideAssertionScenario> {
  return fc
    .uniqueArray(fc.constantFrom(...NODE_STATUS_READABLE_SLUGS), { minLength: 3, maxLength: 3 })
    .map(([keyedSlug = "", quotedSlug = "", straySlug = ""]) => ({
      keyedSlug,
      assertionLines: [
        TAGGED_GROUP.HEADING,
        "",
        `${TAGGED_GROUP.ASSERTION} (${auditTagText(AUDIT_TAG_SPELLING.SLUGGED, keyedSlug)})`,
        `- ALWAYS: a quoted tag such as \`${auditTagText(AUDIT_TAG_SPELLING.SLUGGED, quotedSlug)}\` names no rule`,
      ],
      trailingLines: [
        "## Notes",
        "",
        `A paragraph that mentions ${
          auditTagText(AUDIT_TAG_SPELLING.SLUGGED, straySlug)
        } outside the Assertions section.`,
      ],
    }));
}
