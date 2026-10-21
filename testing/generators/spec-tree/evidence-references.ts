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
  KIND_REGISTRY,
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
  SPEC_TREE_VERIFICATION_TYPE,
  type SpecTreeEvidenceReference,
  type SpecTreeNodeSourceEntry,
  type SpecTreeVerificationType,
} from "@/lib/spec-tree";
import { evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
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

/** A spec holding one assertion line that carries two real evidence tags, and the line number of that assertion in the spec text. */
export type TwoTagLineScenario = EvidenceSpec & {
  readonly lineNumber: number;
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

/** Assertion words, followed in some draws by a code span of tag-like text that declares no evidence. */
function arbitraryAssertionText(): fc.Arbitrary<string> {
  const words = fc
    .array(fc.stringMatching(ASSERTION_WORD_PATTERN), {
      minLength: ASSERTION_LIMITS.MIN_WORDS,
      maxLength: ASSERTION_LIMITS.MAX_WORDS,
    })
    .map((drawn) => drawn.join(ASSERTION_TEXT_SEPARATOR));
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

function unkeyedAuditAssertion(text: string, tagText: string): GeneratedAssertion {
  return {
    line: assertionLine(text, `[${tagText}]`),
    reference: {
      verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
      key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED },
    },
    linkPath: undefined,
    slug: undefined,
    text,
  };
}

function assertionLine(text: string, tag: string): string {
  return `${SPEC_TREE_ASSERTION_BULLET_PREFIX}${text} (${tag})`;
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
          fc.array(fc.tuple(arbitraryAssertionText(), arbitraryLinkPath()), {
            minLength: forms.length,
            maxLength: forms.length,
          }),
        )
        .map(([slugs, parts]) =>
          forms.map((form, index) => {
            const [text, path] = parts[index] ?? [];
            return assertionOfForm(form, text, path, slugs[index] ?? "");
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

function arbitraryNodeParts(): fc.Arbitrary<NodeParts> {
  return fc.record({
    id: SPEC_TREE_TEST_GENERATOR.sourceId(),
    kind: fc.constantFrom(...OUTPUT_KINDS),
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
 * slugged audit tag, among untagged assertions. The spec declares the line malformed.
 */
export function arbitraryTwoTagLineScenario(): fc.Arbitrary<TwoTagLineScenario> {
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
        const tags = forms.map((form, index) => realTagOfForm(form, paths[index] ?? "", slugs[index] ?? ""));
        const doubleTagged: GeneratedAssertion = {
          line: tags.reduce((line, tag) => `${line} (${tag})`, `${SPEC_TREE_ASSERTION_BULLET_PREFIX}${text}`),
          reference: undefined,
          linkPath: undefined,
          slug: undefined,
          text,
        };
        const ordered = [...assertions.slice(0, position), doubleTagged, ...assertions.slice(position)];
        const spec = specFrom(parts, ordered, everyTargetPresent);
        const specText = spec.files.find(({ path }) => path === spec.specPath)?.contents ?? "";
        return { ...spec, lineNumber: specText.split(SPEC_TEXT.LINE_BREAK).indexOf(doubleTagged.line) + 1 };
      })
    );
}
