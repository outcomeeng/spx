/**
 * Generators for node specs whose assertions carry evidence tags, with the evidence references a
 * reader must produce for them.
 *
 * Every spec is built from a drawn list of assertions. Each assertion is rendered into one line of
 * the spec text and, at the same draw, into the reference that line declares: a link assertion
 * declares its verification type from the link text and its key from the link path, an audit
 * assertion declares the audit type keyed by its rule slug or unkeyed, and an untagged assertion
 * declares nothing. The expected references therefore follow the spec's declared relationship
 * between a tag and its reference, never the reader's parsing.
 *
 * @module generators/spec-tree/evidence-references
 */

import { posix } from "node:path";

import * as fc from "fast-check";

import {
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  OUTPUT_KINDS,
  SPEC_TREE_ASSERTION_BULLET_PREFIX,
  SPEC_TREE_ASSERTIONS_HEADING,
  SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR,
  SPEC_TREE_AUDIT_TAG_TEXT,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_KEY_KIND,
  SPEC_TREE_EVIDENCE_LINK_TEXT,
  SPEC_TREE_EVIDENCE_TARGET,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_VERIFICATION_TYPE,
  type SpecTreeEvidenceReference,
  type SpecTreeNodeKind,
  type SpecTreeNodeSourceEntry,
  type SpecTreeVerificationType,
} from "@/lib/spec-tree";
import { evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
import {
  declarationSelectionCases,
  fourZeroOnlyOutputKinds,
  lineComponent,
} from "@testing/generators/spec-tree/grammar-selection";
import { admittedChildKindsOracle } from "@testing/generators/spec-tree/kind-grammar";
import { SPEC_TREE_TEST_GENERATOR, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";

/** The shapes an assertion line takes with respect to evidence tagging. */
export const EVIDENCE_ASSERTION_FORM = {
  TEST_LINK: "test-link",
  EVAL_LINK: "eval-link",
  PROBE_LINK: "probe-link",
  AUDIT_SLUG: "audit-slug",
  AUDIT_PATHLESS: "audit-pathless",
  AUDIT_LEGACY: "audit-legacy",
  UNTAGGED: "untagged",
} as const;

export type EvidenceAssertionForm = (typeof EVIDENCE_ASSERTION_FORM)[keyof typeof EVIDENCE_ASSERTION_FORM];

const ALL_ASSERTION_FORMS: readonly EvidenceAssertionForm[] = Object.values(EVIDENCE_ASSERTION_FORM);

/** The verification type each evidence link text declares, stated by the methodology's tag table. */
const LINK_FORM_ORACLE = [
  {
    form: EVIDENCE_ASSERTION_FORM.TEST_LINK,
    linkText: SPEC_TREE_EVIDENCE_LINK_TEXT.TEST,
    verificationType: SPEC_TREE_VERIFICATION_TYPE.TEST,
  },
  {
    form: EVIDENCE_ASSERTION_FORM.EVAL_LINK,
    linkText: SPEC_TREE_EVIDENCE_LINK_TEXT.EVAL,
    verificationType: SPEC_TREE_VERIFICATION_TYPE.EVAL,
  },
  {
    form: EVIDENCE_ASSERTION_FORM.PROBE_LINK,
    linkText: SPEC_TREE_EVIDENCE_LINK_TEXT.PROBE,
    verificationType: SPEC_TREE_VERIFICATION_TYPE.PROBE,
  },
] as const;

const COVERING_FORMS: readonly EvidenceAssertionForm[] = [
  EVIDENCE_ASSERTION_FORM.TEST_LINK,
  EVIDENCE_ASSERTION_FORM.EVAL_LINK,
  EVIDENCE_ASSERTION_FORM.PROBE_LINK,
  EVIDENCE_ASSERTION_FORM.AUDIT_SLUG,
];

const UNKEYED_AUDIT_FORMS: readonly EvidenceAssertionForm[] = [
  EVIDENCE_ASSERTION_FORM.AUDIT_PATHLESS,
  EVIDENCE_ASSERTION_FORM.AUDIT_LEGACY,
];

const ASSERTION_WORD_PATTERN = /^[a-z]{2,9}$/;

const ASSERTION_LIMITS = {
  MIN_WORDS: 2,
  MAX_WORDS: 9,
  MAX_EXTRA_ASSERTIONS: 10,
} as const;

const SPEC_TEXT = {
  TITLE_PREFIX: "# ",
  LINE_BREAK: "\n",
} as const;

/** A file of a generated tree, at a product-relative path. */
export type EvidenceTreeFile = {
  readonly path: string;
  readonly contents: string;
};

type GeneratedAssertion = {
  readonly line: string;
  readonly reference: SpecTreeEvidenceReference | undefined;
  readonly linkPath: string | undefined;
  readonly slug: string | undefined;
  readonly text: string;
};

/** One generated node: its source entry, the spec file's product-relative path, and the files its text and present link targets occupy. */
export type EvidenceSpec = {
  readonly entry: SpecTreeNodeSourceEntry;
  readonly specPath: string;
  readonly files: readonly EvidenceTreeFile[];
};

/** A spec whose every link target exists, with the references its tagged assertions declare in order of appearance. */
export type EvidenceReferenceScenario = EvidenceSpec & {
  readonly expected: readonly SpecTreeEvidenceReference[];
};

/** A spec holding two audit tags that carry the same rule slug. */
export type DuplicateAuditSlugScenario = EvidenceSpec & {
  readonly slug: string;
};

/** Specs that each hold one audit tag carrying the same rule slug, and no spec repeats it. */
export type RepeatedSlugAcrossSpecsScenario = {
  readonly specs: readonly EvidenceSpec[];
  readonly slug: string;
};

/** One link of a link-target case: its declared verification type, its node-local path, and whether the target file exists. */
export type LinkTargetCase = {
  readonly verificationType: SpecTreeVerificationType;
  readonly path: string;
  readonly present: boolean;
};

/** A spec with one link per evidence link text and target presence, each target file existing exactly when its case says so. */
export type LinkTargetScenario = EvidenceSpec & {
  readonly links: readonly LinkTargetCase[];
};

export type EvidenceReferenceScenarioOptions = {
  /** Forms every generated spec holds at least once. */
  readonly required?: readonly EvidenceAssertionForm[];
  /** Forms the additional assertions are drawn from. */
  readonly extra?: readonly EvidenceAssertionForm[];
};

export function arbitraryRuleSlug(): fc.Arbitrary<string> {
  return fc.uuid().map(evidenceSubject);
}

/** The delimiter of a code span: tag-like text between two of these is prose, never a declared tag. */
const CODE_SPAN_DELIMITER = "`";

const TAG_OPEN = "(";
const TAG_CLOSE = ")";
const SENTENCE_FINAL_PERIOD = ".";

/** The whitespace that may trail a tag line: none, spaces, a tab. */
const TRAILING_WHITESPACE = ["", " ", "   ", "\t"] as const;

/**
 * What the governing assertion admits after a pathless audit tag or legacy review tag: an optional
 * closing parenthesis and an optional sentence-final period, then whitespace to the line end.
 */
const ADMITTED_TAG_TAILS = [
  "",
  SENTENCE_FINAL_PERIOD,
  TAG_CLOSE,
  `${TAG_CLOSE}${SENTENCE_FINAL_PERIOD}`,
] as const;

/**
 * What the governing assertion does not admit after such a tag: a second closing parenthesis, a
 * period ahead of the closing parenthesis, a doubled period, a character beyond the period, and
 * prose after the tag.
 */
const UNADMITTED_TAG_TAILS = [
  `${TAG_CLOSE}${TAG_CLOSE}`,
  `${SENTENCE_FINAL_PERIOD}${TAG_CLOSE}`,
  `${TAG_CLOSE}${SENTENCE_FINAL_PERIOD}${SENTENCE_FINAL_PERIOD}`,
  `${TAG_CLOSE}${SENTENCE_FINAL_PERIOD}${TAG_CLOSE}`,
  `${TAG_CLOSE},`,
  `${TAG_CLOSE} prose`,
] as const;

const ASSERTION_TEXT_SEPARATOR = " ";

/** Tag-like text, in the vocabulary of every tag form, that an assertion mentions inside a code span. */
function arbitraryCodeSpanDecoy(): fc.Arbitrary<string> {
  const linkDecoy = fc
    .tuple(fc.constantFrom(...LINK_FORM_ORACLE.map(({ linkText }) => linkText)), arbitraryLinkPath())
    .map(([linkText, path]) => `[${linkText}](${path})`);
  const slugDecoy = arbitraryRuleSlug().map((slug) =>
    `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}${SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR}${slug}]`
  );
  const unkeyedDecoy = fc
    .constantFrom(SPEC_TREE_AUDIT_TAG_TEXT.CURRENT, SPEC_TREE_AUDIT_TAG_TEXT.LEGACY)
    .map((tagText) => `[${tagText}]`);
  return fc
    .oneof(linkDecoy, slugDecoy, unkeyedDecoy)
    .map((decoy) => `${CODE_SPAN_DELIMITER}${decoy}${CODE_SPAN_DELIMITER}`);
}

/** Assertion words alone. */
function arbitraryAssertionWords(): fc.Arbitrary<string> {
  return fc
    .array(fc.stringMatching(ASSERTION_WORD_PATTERN), {
      minLength: ASSERTION_LIMITS.MIN_WORDS,
      maxLength: ASSERTION_LIMITS.MAX_WORDS,
    })
    .map((drawn) => drawn.join(ASSERTION_TEXT_SEPARATOR));
}

/** Assertion words, followed in some draws by a code span of tag-like text that declares no evidence. */
function arbitraryAssertionText(): fc.Arbitrary<string> {
  const words = arbitraryAssertionWords();
  return fc
    .tuple(words, fc.option(arbitraryCodeSpanDecoy(), { nil: undefined }))
    .map(([prose, decoy]) => decoy === undefined ? prose : [prose, decoy].join(ASSERTION_TEXT_SEPARATOR));
}

function arbitraryLinkPath(): fc.Arbitrary<string> {
  return SPEC_TREE_TEST_GENERATOR
    .evidenceFileName()
    .map((fileName) => [SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, fileName].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR));
}

function assertionOfForm(
  form: EvidenceAssertionForm,
  text: string,
  path: string,
  slug: string,
): GeneratedAssertion {
  const link = LINK_FORM_ORACLE.find((candidate) => candidate.form === form);
  if (link !== undefined) {
    return {
      line: assertionLine(text, `[${link.linkText}](${path})`),
      reference: {
        verificationType: link.verificationType,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path },
        target: SPEC_TREE_EVIDENCE_TARGET.RESOLVED,
      },
      linkPath: path,
      slug: undefined,
      text,
    };
  }
  switch (form) {
    case EVIDENCE_ASSERTION_FORM.AUDIT_SLUG:
      return {
        line: assertionLine(text, `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}${SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR}${slug}]`),
        reference: {
          verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
          key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.SLUG, slug },
        },
        linkPath: undefined,
        slug,
        text,
      };
    case EVIDENCE_ASSERTION_FORM.AUDIT_PATHLESS:
      return unkeyedAuditAssertion(text, SPEC_TREE_AUDIT_TAG_TEXT.CURRENT);
    case EVIDENCE_ASSERTION_FORM.AUDIT_LEGACY:
      return unkeyedAuditAssertion(text, SPEC_TREE_AUDIT_TAG_TEXT.LEGACY);
    default:
      return {
        line: `${SPEC_TREE_ASSERTION_BULLET_PREFIX}${text}`,
        reference: undefined,
        linkPath: undefined,
        slug: undefined,
        text,
      };
  }
}

function unkeyedAuditAssertion(text: string, tagText: string, tail: string = TAG_CLOSE): GeneratedAssertion {
  return {
    line: assertionLine(text, `[${tagText}]`, tail),
    reference: {
      verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
      key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED },
    },
    linkPath: undefined,
    slug: undefined,
    text,
  };
}

/** The assertion line with its closing parenthesis replaced by the given tail and trailing whitespace. */
function withPathlessTail(line: string, tail: string, whitespace: string): string {
  const tagEnd = line.lastIndexOf("]") + 1;
  const head = line.slice(0, tagEnd);
  const openIndex = head.lastIndexOf(`${TAG_OPEN}[`);
  const opened = tail.startsWith(TAG_CLOSE) || openIndex < 0
    ? head
    : `${head.slice(0, openIndex)}${head.slice(openIndex + TAG_OPEN.length)}`;
  return `${opened}${tail}${whitespace}`;
}

function assertionLine(text: string, tag: string, tail: string = TAG_CLOSE): string {
  const opening = tail.startsWith(TAG_CLOSE) ? TAG_OPEN : "";
  return `${SPEC_TREE_ASSERTION_BULLET_PREFIX}${text} ${opening}${tag}${tail}`;
}

/** The assertions of one spec: the required forms and the drawn extra forms, in a drawn order, with distinct audit slugs. */
function arbitraryAssertionSet(
  options: EvidenceReferenceScenarioOptions,
): fc.Arbitrary<readonly GeneratedAssertion[]> {
  const required = options.required ?? [];
  const extra = options.extra ?? ALL_ASSERTION_FORMS;
  return fc
    .array(fc.constantFrom(...extra), { maxLength: ASSERTION_LIMITS.MAX_EXTRA_ASSERTIONS })
    .chain((extraForms) =>
      fc.shuffledSubarray([...required, ...extraForms], {
        minLength: required.length + extraForms.length,
        maxLength: required.length + extraForms.length,
      })
    )
    .chain((forms) =>
      fc
        .tuple(
          fc.uniqueArray(arbitraryRuleSlug(), { minLength: forms.length, maxLength: forms.length }),
          fc.array(
            fc.tuple(
              arbitraryAssertionText(),
              arbitraryLinkPath(),
              fc.constantFrom(...ADMITTED_TAG_TAILS),
              fc.constantFrom(...TRAILING_WHITESPACE),
            ),
            { minLength: forms.length, maxLength: forms.length },
          ),
        )
        .map(([slugs, parts]) =>
          forms.map((form, index) => {
            const [text, path, tail, whitespace] = parts[index] ?? [];
            const assertion = assertionOfForm(form, text, path, slugs[index] ?? "");
            return UNKEYED_AUDIT_FORMS.includes(form)
              ? { ...assertion, line: withPathlessTail(assertion.line, tail, whitespace) }
              : assertion;
          })
        )
    );
}

type NodeParts = {
  readonly id: string;
  readonly kind: (typeof OUTPUT_KINDS)[number];
  readonly order: number;
  readonly slug: string;
  readonly title: string;
};

/** The output kinds a product admits as a top-level node, by the independent admitted-children cases. */
const TOP_LEVEL_OUTPUT_KINDS = OUTPUT_KINDS.filter((kind) =>
  (admittedChildKindsOracle(SPEC_TREE_CONFIG.PRODUCT.KIND) as readonly string[]).includes(kind)
);

function arbitraryNodeParts(): fc.Arbitrary<NodeParts> {
  return fc.record({
    id: SPEC_TREE_TEST_GENERATOR.sourceId(),
    kind: fc.constantFrom(...TOP_LEVEL_OUTPUT_KINDS),
    order: SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
    slug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    title: SPEC_TREE_TEST_GENERATOR.sourceTitle(),
  });
}

function specFrom(
  parts: NodeParts,
  assertions: readonly GeneratedAssertion[],
  isPresent: (linkPath: string) => boolean,
): EvidenceSpec {
  const entryShape = {
    type: SPEC_TREE_ENTRY_TYPE.NODE,
    id: parts.id,
    kind: parts.kind,
    orderSegments: [parts.order],
    slug: parts.slug,
    title: parts.title,
  } as const;
  const specPath = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    specTreeFixtureNodeDirectoryName(KIND_REGISTRY, entryShape),
    `${parts.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`,
  ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const specText = [
    `${SPEC_TEXT.TITLE_PREFIX}${parts.title}`,
    "",
    SPEC_TREE_ASSERTIONS_HEADING,
    "",
    ...assertions.map(({ line }) => line),
    "",
  ].join(SPEC_TEXT.LINE_BREAK);
  const targetFiles = assertions.flatMap((assertion) =>
    assertion.linkPath !== undefined && isPresent(assertion.linkPath)
      ? [{ path: posix.join(posix.dirname(specPath), assertion.linkPath), contents: assertion.text }]
      : []
  );
  return {
    entry: { ...entryShape, ref: { id: specPath, path: specPath } },
    specPath,
    files: [{ path: specPath, contents: specText }, ...targetFiles],
  };
}

function everyTargetPresent(): boolean {
  return true;
}

export function arbitraryEvidenceReferenceScenario(
  options: EvidenceReferenceScenarioOptions = {},
): fc.Arbitrary<EvidenceReferenceScenario> {
  return fc.tuple(arbitraryNodeParts(), arbitraryAssertionSet(options)).map(([parts, assertions]) => ({
    ...specFrom(parts, assertions, everyTargetPresent),
    expected: assertions.flatMap(({ reference }) => reference === undefined ? [] : [reference]),
  }));
}

/** A spec whose assertions include at least one link of each evidence link text and one audit tag keyed by a rule slug. */
export function arbitraryCoveringEvidenceReferenceScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return arbitraryEvidenceReferenceScenario({ required: COVERING_FORMS });
}

/** Every shape of tagged assertion: each link text, a slugged audit tag, a pathless audit tag, and the legacy review tag. */
export const EVIDENCE_TAG_FORMS: readonly EvidenceAssertionForm[] = ALL_ASSERTION_FORMS.filter(
  (form) => form !== EVIDENCE_ASSERTION_FORM.UNTAGGED,
);

/** A spec holding one assertion of the given tag form, beside untagged assertions. */
export function arbitraryTagFormScenario(form: EvidenceAssertionForm): fc.Arbitrary<EvidenceReferenceScenario> {
  return arbitraryEvidenceReferenceScenario({
    required: [form],
    extra: [EVIDENCE_ASSERTION_FORM.UNTAGGED],
  });
}

/** A spec whose tagged assertions are pathless `[audit]` and legacy `[review]` tags, beside untagged assertions. */
export function arbitraryUnkeyedAuditScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return arbitraryEvidenceReferenceScenario({
    required: UNKEYED_AUDIT_FORMS,
    extra: [...UNKEYED_AUDIT_FORMS, EVIDENCE_ASSERTION_FORM.UNTAGGED],
  });
}

export function arbitraryDuplicateAuditSlugScenario(): fc.Arbitrary<DuplicateAuditSlugScenario> {
  return fc
    .tuple(
      arbitraryNodeParts(),
      arbitraryAssertionSet({ required: [EVIDENCE_ASSERTION_FORM.AUDIT_SLUG] }),
      arbitraryAssertionText(),
    )
    .chain(([parts, assertions, text]) => {
      const repeated = assertions.find(({ slug }) => slug !== undefined)?.slug ?? "";
      return fc.nat(assertions.length).map((position) => {
        const duplicate = assertionOfForm(EVIDENCE_ASSERTION_FORM.AUDIT_SLUG, text, "", repeated);
        const withDuplicate = [...assertions.slice(0, position), duplicate, ...assertions.slice(position)];
        return { ...specFrom(parts, withDuplicate, everyTargetPresent), slug: repeated };
      });
    });
}

export function arbitraryRepeatedSlugAcrossSpecsScenario(): fc.Arbitrary<RepeatedSlugAcrossSpecsScenario> {
  const nonSlugForms = ALL_ASSERTION_FORMS.filter((form) => form !== EVIDENCE_ASSERTION_FORM.AUDIT_SLUG);
  const specWithSlug = (slug: string): fc.Arbitrary<EvidenceSpec> =>
    fc
      .tuple(arbitraryNodeParts(), arbitraryAssertionSet({ extra: nonSlugForms }), arbitraryAssertionText())
      .map(([parts, assertions, text]) =>
        specFrom(
          parts,
          [...assertions, assertionOfForm(EVIDENCE_ASSERTION_FORM.AUDIT_SLUG, text, "", slug)],
          everyTargetPresent,
        )
      );
  return arbitraryRuleSlug().chain((slug) =>
    fc.tuple(specWithSlug(slug), specWithSlug(slug)).map(([first, second]) => ({ specs: [first, second], slug }))
  );
}

/**
 * One link for every evidence link text at each target presence: the complete finite domain of
 * link kinds and target states. A target file exists exactly for the cases that say present.
 */
export function arbitraryLinkTargetScenario(): fc.Arbitrary<LinkTargetScenario> {
  const domain = LINK_FORM_ORACLE.flatMap((link) => [
    { ...link, present: true },
    { ...link, present: false },
  ]);
  return fc
    .tuple(
      arbitraryNodeParts(),
      fc.array(fc.tuple(arbitraryAssertionText(), arbitraryLinkPath()), {
        minLength: domain.length,
        maxLength: domain.length,
      }),
    )
    .map(([parts, drawn]) => {
      const cases = domain.map((link, index) => {
        const [text, path] = drawn[index] ?? [];
        return { link, text, path };
      });
      const presentPaths = new Set(cases.filter(({ link }) => link.present).map(({ path }) => path));
      return {
        ...specFrom(
          parts,
          cases.map(({ link, text, path }) => assertionOfForm(link.form, text, path, "")),
          (linkPath) => presentPaths.has(linkPath),
        ),
        links: cases.map(({ link, path }) => ({
          verificationType: link.verificationType,
          path,
          present: link.present,
        })),
      };
    });
}

/** The brackets-and-word forms of a pathless audit tag, which prose may mention away from the tag position. */
const PATHLESS_TAG_TEXTS = [SPEC_TREE_AUDIT_TAG_TEXT.CURRENT, SPEC_TREE_AUDIT_TAG_TEXT.LEGACY] as const;

/** Forms whose real tag is read wherever it stands on the line: every link form and the slugged audit form. */
const ANYWHERE_TAG_FORMS: readonly EvidenceAssertionForm[] = COVERING_FORMS;

/** Forms that end an assertion line with a tag other than a pathless audit tag, or with no tag. */
const NON_PATHLESS_END_FORMS: readonly EvidenceAssertionForm[] = [
  ...COVERING_FORMS,
  EVIDENCE_ASSERTION_FORM.UNTAGGED,
];

function realTagOfForm(form: EvidenceAssertionForm, path: string, slug: string): string {
  const link = LINK_FORM_ORACLE.find((candidate) => candidate.form === form);
  return link !== undefined
    ? `[${link.linkText}](${path})`
    : `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}${SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR}${slug}]`;
}

/**
 * A spec whose assertions mention a pathless audit or legacy review word in brackets inside the
 * prose, away from the tag position, and end in a link tag, a slugged audit tag, or no tag. The
 * expected references are those of the tags at the line ends alone; bracketed prose declares none.
 */
export function arbitraryBracketedProseScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return fc
    .tuple(
      arbitraryNodeParts(),
      fc.array(
        fc.tuple(
          fc.constantFrom(...NON_PATHLESS_END_FORMS),
          arbitraryAssertionText(),
          fc.constantFrom(...PATHLESS_TAG_TEXTS),
          arbitraryAssertionText(),
          arbitraryLinkPath(),
        ),
        { minLength: 1, maxLength: ASSERTION_LIMITS.MAX_EXTRA_ASSERTIONS },
      ),
      fc.uniqueArray(arbitraryRuleSlug(), {
        minLength: ASSERTION_LIMITS.MAX_EXTRA_ASSERTIONS,
        maxLength: ASSERTION_LIMITS.MAX_EXTRA_ASSERTIONS,
      }),
    )
    .map(([parts, drawn, slugs]) => {
      const assertions = drawn.map(([form, before, tagText, after, path], index) =>
        assertionOfForm(
          form,
          [before, `[${tagText}]`, after].join(ASSERTION_TEXT_SEPARATOR),
          path,
          slugs[index] ?? "",
        )
      );
      return {
        ...specFrom(parts, assertions, everyTargetPresent),
        expected: assertions.flatMap(({ reference }) => reference === undefined ? [] : [reference]),
      };
    });
}

/**
 * A spec with one assertion line that carries two real evidence tags, each a link tag or a
 * slugged audit tag, among untagged assertions. The spec declares that such a line keeps its
 * first tag, so the expected references hold the first tag's reference at the line's position
 * and none for the second tag.
 */
export function arbitraryTwoTagLineScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return fc
    .tuple(
      arbitraryNodeParts(),
      arbitraryAssertionSet({ extra: [EVIDENCE_ASSERTION_FORM.UNTAGGED] }),
      arbitraryAssertionText(),
      fc.tuple(fc.constantFrom(...ANYWHERE_TAG_FORMS), fc.constantFrom(...ANYWHERE_TAG_FORMS)),
      fc.uniqueArray(arbitraryLinkPath(), { minLength: 2, maxLength: 2 }),
      fc.uniqueArray(arbitraryRuleSlug(), { minLength: 2, maxLength: 2 }),
    )
    .chain(([parts, assertions, text, forms, paths, slugs]) =>
      fc.nat(assertions.length).map((position) => {
        const first = assertionOfForm(forms[0], text, paths[0] ?? "", slugs[0] ?? "");
        const secondTag = realTagOfForm(forms[1], paths[1] ?? "", slugs[1] ?? "");
        const doubleTagged: GeneratedAssertion = { ...first, line: `${first.line} (${secondTag})` };
        const ordered = [...assertions.slice(0, position), doubleTagged, ...assertions.slice(position)];
        return {
          ...specFrom(parts, ordered, everyTargetPresent),
          expected: ordered.flatMap(({ reference }) => reference === undefined ? [] : [reference]),
        };
      })
    );
}

/** The methodology declaration a product carries: its version and, while migrating, the version it migrates from. */
export type EvidenceDeclaration = {
  readonly version: string;
  readonly migratingFrom?: string;
};

/** Whether the directory a link enters is one the declared grammar accepts as a node directory or an ordinary folder inside the citing node. */
export const LINKED_DIRECTORY_CLASS = {
  NODE: "node",
  FOLDER: "folder",
} as const;

export type LinkedDirectoryClass = (typeof LINKED_DIRECTORY_CLASS)[keyof typeof LINKED_DIRECTORY_CLASS];

/** One member of the finite domain of methodology declarations a product can make, with the class of the directory its node's link enters. */
export type DeclaredGrammarLinkCase = {
  readonly label: string;
  readonly declaration: EvidenceDeclaration;
  readonly directory: LinkedDirectoryClass;
};

/**
 * A product whose methodology declaration selects a grammar, with one node spec whose test link
 * enters one directory, and the target file that directory holds. When the declared grammar
 * accepts the directory as a node directory the link names a descendant node and the spec
 * declares it dangling; when the grammar does not accept it the directory is an ordinary folder
 * inside the citing node and the spec declares the link resolved.
 */
export type DeclaredGrammarLinkScenario = DeclaredGrammarLinkCase & {
  readonly slug: string;
  readonly files: readonly EvidenceTreeFile[];
  readonly expected: SpecTreeEvidenceReference;
};

/** The order index a three-digit directory takes, which the 4.0 grammar's two-digit index form does not accept. */
const THREE_DIGIT_ORDER = { MIN: 100, MAX: 999 } as const;

/**
 * Every methodology declaration SPX reads — each line in each accepted version form, and a 4.0
 * target migrating from each 3.x line — paired with each class of linked directory.
 */
export function declaredGrammarLinkCases(): readonly DeclaredGrammarLinkCase[] {
  return declarationSelectionCases().flatMap(({ label, declaration }) =>
    Object.values(LINKED_DIRECTORY_CLASS).map((directory) => ({
      label: `${label}, a link into a ${directory}`,
      declaration,
      directory,
    }))
  );
}

type DirectoryNaming = {
  /** The suffixes of the kinds the citing node takes, which the declared grammar reads as nodes. */
  readonly citingKinds: readonly SpecTreeNodeKind[];
  readonly specFileSuffix: string;
  /** The suffixes of the directories the declared grammar accepts as node directories. */
  readonly nodeKinds: readonly Kind[];
  /** The suffixes of known kinds the declared grammar does not accept, when it leaves any. */
  readonly folderKinds: readonly Kind[];
};

/**
 * The directory naming each declaration shape accepts, stated by the methodology: the 3.x lines
 * name the 3.x kinds only, and the 4.0 line names the output kinds and still carries the 3.x forms
 * of the versions ordered before it, so no known kind suffix is left outside it.
 */
function directoryNaming({ version, migratingFrom }: EvidenceDeclaration): DirectoryNaming {
  if (migratingFrom === undefined && lineComponent(version) !== SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO) {
    return {
      citingKinds: NODE_KINDS,
      specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
      nodeKinds: NODE_KINDS,
      folderKinds: fourZeroOnlyOutputKinds(),
    };
  }
  return {
    citingKinds: TOP_LEVEL_OUTPUT_KINDS,
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    nodeKinds: OUTPUT_KINDS,
    folderKinds: [],
  };
}

function directoryName(order: number | string, slug: string, kind: Kind): string {
  return `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${KIND_REGISTRY[kind].suffix}`;
}

/**
 * The directory kinds of `naming` that a citing node of `citingKind` admits as children, so a
 * directory a link enters nests only a kind the citing node's kind admits. A kind that resolves
 * no admitted children in the independent cases places no limit. The admitted kinds come from the
 * independent admitted-children cases, never from the kind registry assembly enforces.
 */
function admittedNodeKinds(citingKind: SpecTreeNodeKind, naming: DirectoryNaming): readonly Kind[] {
  const admitted: readonly string[] = admittedChildKindsOracle(citingKind);
  return admitted.length === 0 ? naming.nodeKinds : naming.nodeKinds.filter((kind) => admitted.includes(kind));
}

function linkedDirectoryName(
  linkCase: DeclaredGrammarLinkCase,
  naming: DirectoryNaming,
  citingKind: SpecTreeNodeKind,
  slug: string,
  order: number | string,
  threeDigitOrder: number,
  kindIndex: number,
): string {
  if (linkCase.directory === LINKED_DIRECTORY_CLASS.NODE) {
    const admitted = admittedNodeKinds(citingKind, naming);
    return directoryName(order, slug, admitted[kindIndex % admitted.length]);
  }
  if (naming.folderKinds.length > 0) {
    return directoryName(order, slug, naming.folderKinds[kindIndex % naming.folderKinds.length]);
  }
  return directoryName(threeDigitOrder, slug, "capability");
}

/**
 * The scenario one declared-grammar case draws: a citing node of a kind the declaration reads,
 * and a link into a directory of the case's class under the declaration's grammar. A
 * declaration whose grammar accepts every known node suffix, the 4.0 line, takes a capability-named
 * directory with a three-digit index as its folder, a form neither of its grammars accepts.
 */
export function arbitraryDeclaredGrammarLinkScenario(
  linkCase: DeclaredGrammarLinkCase,
): fc.Arbitrary<DeclaredGrammarLinkScenario> {
  const naming = directoryNaming(linkCase.declaration);
  return fc
    .tuple(
      fc.nat(naming.citingKinds.length - 1),
      fc.nat(Math.max(naming.nodeKinds.length, naming.folderKinds.length, 1) - 1),
      fc.tuple(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), SPEC_TREE_TEST_GENERATOR.filesystemOrder()),
      fc.integer({ min: THREE_DIGIT_ORDER.MIN, max: THREE_DIGIT_ORDER.MAX }),
      fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { minLength: 2, maxLength: 2 }),
      arbitraryAssertionText(),
      arbitraryLinkPath(),
    )
    .map(
      (
        [
          citingIndex,
          linkedKindIndex,
          [nodeOrder, linkedOrder],
          threeDigitOrder,
          [nodeSlug, linkedSlug],
          text,
          linkTail,
        ],
      ) => {
        const citingKind = naming.citingKinds[citingIndex];
        const linkedDirectory = linkedDirectoryName(
          linkCase,
          naming,
          citingKind,
          linkedSlug,
          linkedOrder,
          threeDigitOrder,
          linkedKindIndex,
        );
        const linkPath = [linkedDirectory, linkTail].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
        const specPath = [
          SPEC_TREE_CONFIG.ROOT_DIRECTORY,
          directoryName(nodeOrder, nodeSlug, citingKind),
          `${nodeSlug}${naming.specFileSuffix}`,
        ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
        const specText = [
          `${SPEC_TEXT.TITLE_PREFIX}${nodeSlug}`,
          "",
          SPEC_TREE_ASSERTIONS_HEADING,
          "",
          assertionLine(text, `[${SPEC_TREE_EVIDENCE_LINK_TEXT.TEST}](${linkPath})`),
          "",
        ].join(SPEC_TEXT.LINE_BREAK);
        return {
          ...linkCase,
          slug: nodeSlug,
          files: [
            { path: specPath, contents: specText },
            { path: posix.join(posix.dirname(specPath), linkPath), contents: text },
          ],
          expected: {
            verificationType: SPEC_TREE_VERIFICATION_TYPE.TEST,
            key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path: linkPath },
            target: linkCase.directory === LINKED_DIRECTORY_CLASS.NODE
              ? SPEC_TREE_EVIDENCE_TARGET.DANGLING
              : SPEC_TREE_EVIDENCE_TARGET.RESOLVED,
          },
        };
      },
    );
}

/** The tag-like texts of every tag form, each rendered from a link path and a rule slug; none is a tag inside a code span. */
const CODE_SPAN_DECOY_TAGS: readonly ((path: string, slug: string) => string)[] = [
  ...LINK_FORM_ORACLE.map(({ linkText }) => (path: string) => `[${linkText}](${path})`),
  (_path, slug) => `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}${SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR}${slug}]`,
  ...PATHLESS_TAG_TEXTS.map((tagText) => () => `[${tagText}]`),
];

function shuffled<T>(items: readonly T[]): fc.Arbitrary<readonly T[]> {
  return fc.shuffledSubarray([...items], { minLength: items.length, maxLength: items.length });
}

function scenarioOfAssertions(
  parts: NodeParts,
  assertions: readonly GeneratedAssertion[],
): EvidenceReferenceScenario {
  return {
    ...specFrom(parts, assertions, everyTargetPresent),
    expected: assertions.flatMap(({ reference }) => reference === undefined ? [] : [reference]),
  };
}

/**
 * A spec holding, for every tag form, one assertion that mentions that form's tag inside a code
 * span and carries no real tag, and one assertion that mentions it inside a code span before a
 * real link or slugged audit tag. The expected references are those of the real tags alone; a
 * tag-like text inside a code span declares nothing, including at the end of the line.
 */
export function arbitraryCodeSpanScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  const count = CODE_SPAN_DECOY_TAGS.length;
  return fc
    .tuple(
      arbitraryNodeParts(),
      fc.array(fc.tuple(arbitraryAssertionWords(), arbitraryLinkPath(), arbitraryLinkPath()), {
        minLength: 2 * count,
        maxLength: 2 * count,
      }),
      fc.uniqueArray(arbitraryRuleSlug(), { minLength: 3 * count, maxLength: 3 * count }),
      fc.array(fc.constantFrom(...ANYWHERE_TAG_FORMS), { minLength: count, maxLength: count }),
    )
    .chain(([parts, drawn, slugs, realForms]) => {
      const mentioning = (decoyIndex: number, drawIndex: number): { text: string; realPath: string } => {
        const [words, decoyPath, realPath] = drawn[drawIndex];
        const decoy = CODE_SPAN_DECOY_TAGS[decoyIndex](decoyPath, slugs[drawIndex]);
        return {
          text: [words, `${CODE_SPAN_DELIMITER}${decoy}${CODE_SPAN_DELIMITER}`].join(ASSERTION_TEXT_SEPARATOR),
          realPath,
        };
      };
      const assertions = CODE_SPAN_DECOY_TAGS.flatMap((_decoyTag, index) => [
        assertionOfForm(EVIDENCE_ASSERTION_FORM.UNTAGGED, mentioning(index, index).text, "", ""),
        assertionOfForm(
          realForms[index] ?? EVIDENCE_ASSERTION_FORM.TEST_LINK,
          mentioning(index, count + index).text,
          mentioning(index, count + index).realPath,
          slugs[2 * count + index] ?? "",
        ),
      ]);
      return shuffled(assertions).map((ordered) => scenarioOfAssertions(parts, ordered));
    });
}

/**
 * A spec holding, for every link form and the slugged audit form, one assertion whose real tag is
 * followed by more prose, and for the pathless audit tag and the legacy review tag, one assertion
 * that ends in the bare tag with no enclosing parenthesis. Each assertion declares the reference
 * of its tag.
 */
export function arbitraryTagPositionScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  const midLineCount = ANYWHERE_TAG_FORMS.length;
  const bareCount = PATHLESS_TAG_TEXTS.length;
  return fc
    .tuple(
      arbitraryNodeParts(),
      fc.array(fc.tuple(arbitraryAssertionWords(), arbitraryAssertionWords(), arbitraryLinkPath()), {
        minLength: midLineCount + bareCount,
        maxLength: midLineCount + bareCount,
      }),
      fc.uniqueArray(arbitraryRuleSlug(), { minLength: midLineCount, maxLength: midLineCount }),
    )
    .chain(([parts, drawn, slugs]) => {
      const midLine = ANYWHERE_TAG_FORMS.map((form, index): GeneratedAssertion => {
        const [words, trailing, path] = drawn[index];
        const tagged = assertionOfForm(form, words, path, slugs[index]);
        return { ...tagged, line: [tagged.line, trailing].join(ASSERTION_TEXT_SEPARATOR) };
      });
      const bareEnd = PATHLESS_TAG_TEXTS.map((tagText, index): GeneratedAssertion => {
        const [words] = drawn[midLineCount + index];
        const tagged = unkeyedAuditAssertion(words, tagText);
        return {
          ...tagged,
          line: `${SPEC_TREE_ASSERTION_BULLET_PREFIX}${words} [${tagText}]`,
        };
      });
      return shuffled([...midLine, ...bareEnd]).map((ordered) => scenarioOfAssertions(parts, ordered));
    });
}

/**
 * A spec holding, for every pathless audit tag and legacy review tag, one assertion per admitted
 * tail — a bare tag, a tag then a closing parenthesis, a tag then a sentence-final period, a tag
 * then both — each with a drawn run of trailing whitespace. The governing assertion admits each
 * tail, so each assertion declares the unkeyed audit reference of its tag.
 */
export function arbitraryAdmittedTagTailScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return arbitraryPathlessTailScenario(ADMITTED_TAG_TAILS, true);
}

/**
 * A spec holding, for every pathless audit tag and legacy review tag, one assertion per tail the
 * governing assertion does not admit. A tag in no admitted position is prose, so the expected
 * references are empty.
 */
export function arbitraryUnadmittedTagTailScenario(): fc.Arbitrary<EvidenceReferenceScenario> {
  return arbitraryPathlessTailScenario(UNADMITTED_TAG_TAILS, false);
}

function arbitraryPathlessTailScenario(
  tails: readonly string[],
  admitted: boolean,
): fc.Arbitrary<EvidenceReferenceScenario> {
  const count = PATHLESS_TAG_TEXTS.length * tails.length;
  return fc
    .tuple(
      arbitraryNodeParts(),
      fc.array(fc.tuple(arbitraryAssertionWords(), fc.constantFrom(...TRAILING_WHITESPACE)), {
        minLength: count,
        maxLength: count,
      }),
    )
    .chain(([parts, drawn]) => {
      const assertions = PATHLESS_TAG_TEXTS.flatMap((tagText, tagIndex) =>
        tails.map((tail, tailIndex): GeneratedAssertion => {
          const [words, whitespace] = drawn[tagIndex * tails.length + tailIndex];
          const tagged = unkeyedAuditAssertion(words, tagText, tail);
          return {
            ...tagged,
            line: `${tagged.line}${whitespace}`,
            reference: admitted ? tagged.reference : undefined,
          };
        })
      );
      return shuffled(assertions).map((ordered) => scenarioOfAssertions(parts, ordered));
    });
}
