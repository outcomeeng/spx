import * as fc from "fast-check";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { PROBE_PAYLOAD_FIELD, PROBE_UNIT_KIND } from "@/domains/verify/verify";

/** A slug: lowercase letters and digits in hyphen-joined groups, as Node directories and probe directories spell it. */
function arbitrarySlug(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9]{1,7}$/),
      fc.option(fc.stringMatching(/^[a-z0-9]{1,6}$/), { nil: undefined }),
    )
    .map(([head, tail]) => (tail === undefined ? head : `${head}-${tail}`));
}

/** One Node directory name: an index, a slug, and the given kind. */
function arbitraryNodeDirectoryName(kinds: readonly string[]): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: 10, max: 99 }), arbitrarySlug(), fc.constantFrom(...kinds))
    .map(([index, slug, kind]) => `${index}-${slug}.${kind}`);
}

const OUTPUT_KINDS = ["enabler", "capability", "domain"] as const;

/** The shapes of an output Node's path under `spx/`. */
const NODE_PATH_SHAPE = {
  TOP_LEVEL: "top-level-node",
  NESTED: "nested-node",
} as const;

type NodePathShape = (typeof NODE_PATH_SHAPE)[keyof typeof NODE_PATH_SHAPE];

/**
 * An output Node's path under `spx/`: of the given shape, or of either when none is given — a top-level
 * Node, or a Node below an output Node or a nested Product.
 */
function arbitraryNodeDirectory(shape?: NodePathShape): fc.Arbitrary<string> {
  if (shape === undefined) {
    return fc.oneof(arbitraryNodeDirectory(NODE_PATH_SHAPE.TOP_LEVEL), arbitraryNodeDirectory(NODE_PATH_SHAPE.NESTED));
  }
  if (shape === NODE_PATH_SHAPE.TOP_LEVEL) return arbitraryNodeDirectoryName(OUTPUT_KINDS).map((node) => `spx/${node}`);
  return fc
    .tuple(arbitraryNodeDirectoryName([...OUTPUT_KINDS, "product"]), arbitraryNodeDirectoryName(OUTPUT_KINDS))
    .map(([parent, node]) => `spx/${parent}/${node}`);
}

/** A probe protocol path: a `probe.md` directly inside a directory under a Node's `probes/`. */
function arbitraryProtocolPath(shape?: NodePathShape): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryNodeDirectory(shape), arbitrarySlug())
    .map(([node, probe]) => `${node}/probes/${probe}/probe.md`);
}

/** An artifact file name of the form `<slug>.<ext>` other than `probe.md`. */
function arbitraryArtifactName(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySlug(), fc.constantFrom("txt", "json", "log", "png", "md"))
    .map(([slug, ext]) => `${slug}.${ext}`)
    .filter((name) => name !== "probe.md");
}

/** The directory of a protocol path. */
function protocolDirectory(protocol: string): string {
  return protocol.slice(0, protocol.lastIndexOf("/"));
}

/** The spec path of the Node a protocol path sits under. */
function nodeSpecPath(protocol: string): string {
  const node = protocol.slice(0, protocol.indexOf("/probes/"));
  const name = node.slice(node.lastIndexOf("/") + 1).replace(/^\d+-/, "").replace(/\.[a-z]+$/, "");
  return `${node}/${name}.md`;
}

/** A probe run's units, all drawn for one protocol: an artifact beside it and an observed assertion. */
export interface ProbeRunUnits {
  readonly protocol: string;
  readonly protocolUnit: { readonly unitKind: string; readonly subject: string };
  readonly artifactUnit: { readonly unitKind: string; readonly subject: string };
  readonly assertionUnit: { readonly unitKind: string; readonly subject: string; readonly slug: string };
  readonly unexercisedUnit: { readonly unitKind: string; readonly subject: string; readonly reason: string };
}

function arbitraryProbeRunUnits(shape?: NodePathShape): fc.Arbitrary<ProbeRunUnits> {
  return fc
    .tuple(
      arbitraryProtocolPath(shape),
      arbitraryArtifactName(),
      arbitrarySlug(),
      arbitrarySlug(),
      fc.string({ minLength: 1 }),
    )
    .map(([protocol, artifact, assertionSlug, unexercisedSlug, reason]) => ({
      protocol,
      protocolUnit: {
        [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.PROTOCOL,
        [PROBE_PAYLOAD_FIELD.SUBJECT]: protocol,
      },
      artifactUnit: {
        [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.ARTIFACT,
        [PROBE_PAYLOAD_FIELD.SUBJECT]: `${protocolDirectory(protocol)}/${artifact}`,
      },
      assertionUnit: {
        [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.ASSERTION,
        [PROBE_PAYLOAD_FIELD.SUBJECT]: nodeSpecPath(protocol),
        [PROBE_PAYLOAD_FIELD.SLUG]: assertionSlug,
      },
      unexercisedUnit: {
        [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.UNEXERCISED,
        [PROBE_PAYLOAD_FIELD.SUBJECT]: nodeSpecPath(protocol),
        [PROBE_PAYLOAD_FIELD.SLUG]: unexercisedSlug,
        [PROBE_PAYLOAD_FIELD.REASON]: reason,
      },
    }));
}

/** A finding departing from the run's assertion unit, shown by its artifact unit. */
function probeFindingFor(units: ProbeRunUnits): fc.Arbitrary<Readonly<Record<string, unknown>>> {
  return fc
    .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
    .map(([message, observed, expected]) => ({
      [PROBE_PAYLOAD_FIELD.ASSERTION_SUBJECT]: units.assertionUnit.subject,
      [PROBE_PAYLOAD_FIELD.SLUG]: units.assertionUnit.slug,
      [PROBE_PAYLOAD_FIELD.ARTIFACT_SUBJECT]: units.artifactUnit.subject,
      [PROBE_PAYLOAD_FIELD.MESSAGE]: message,
      [PROBE_PAYLOAD_FIELD.EVIDENCE]: {
        [PROBE_PAYLOAD_FIELD.OBSERVED]: observed,
        [PROBE_PAYLOAD_FIELD.EXPECTED]: expected,
      },
    }));
}

/** The classes of artifact subject the probe form refuses for a protocol. */
const REFUSED_ARTIFACT_CLASS = {
  UNDER_RUNS: "under-runs",
  OTHER_SUBDIRECTORY: "other-subdirectory",
  PROTOCOL_FILE: "protocol-file",
  OUTSIDE_SLUG_EXT: "outside-slug-ext",
  BESIDE_OTHER_PROTOCOL: "beside-other-protocol",
} as const;

type RefusedArtifactClass = (typeof REFUSED_ARTIFACT_CLASS)[keyof typeof REFUSED_ARTIFACT_CLASS];

/** An artifact subject of the given refused class for a protocol. */
function arbitraryRefusedArtifactSubject(protocol: string, refused: RefusedArtifactClass): fc.Arbitrary<string> {
  const directory = protocolDirectory(protocol);
  switch (refused) {
    case REFUSED_ARTIFACT_CLASS.UNDER_RUNS:
      return arbitraryArtifactName().map((name) => `${directory}/runs/${name}`);
    case REFUSED_ARTIFACT_CLASS.OTHER_SUBDIRECTORY:
      return fc.tuple(arbitrarySlug(), arbitraryArtifactName()).map(([sub, name]) => `${directory}/${sub}/${name}`);
    case REFUSED_ARTIFACT_CLASS.PROTOCOL_FILE:
      return fc.constant(`${directory}/probe.md`);
    case REFUSED_ARTIFACT_CLASS.OUTSIDE_SLUG_EXT:
      return arbitrarySlug().map((name) => `${directory}/${name}`);
    case REFUSED_ARTIFACT_CLASS.BESIDE_OTHER_PROTOCOL:
      return arbitraryArtifactName().map((name) => `${directory}-other/${name}`);
  }
}

/** The classes of path that name no probe protocol. */
const NON_PROTOCOL_PATH_CLASS = {
  NOT_PROBE_MD: "not-probe-md",
  DEEPER: "deeper-than-probe-directory",
  UNDER_TESTS: "under-tests",
  OUTSIDE_SPEC_TREE: "outside-spec-tree",
  UNDER_PRODUCT_ROOT: "under-product-root",
  UNDER_NESTED_PRODUCT: "under-nested-product",
  NON_NODE_OWNER: "non-node-owner",
  NON_NODE_ANCESTOR: "non-node-ancestor",
} as const;

type NonProtocolPathClass = (typeof NON_PROTOCOL_PATH_CLASS)[keyof typeof NON_PROTOCOL_PATH_CLASS];

/** A path of the given class that names no probe protocol. */
function arbitraryNonProtocolPath(nonProtocol: NonProtocolPathClass): fc.Arbitrary<string> {
  switch (nonProtocol) {
    case NON_PROTOCOL_PATH_CLASS.NOT_PROBE_MD:
      return arbitraryProtocolPath().map((protocol) => protocol.replace(/probe\.md$/, "notes.md"));
    case NON_PROTOCOL_PATH_CLASS.DEEPER:
      return arbitraryProtocolPath().map((protocol) => protocol.replace("/probe.md", "/deeper/probe.md"));
    case NON_PROTOCOL_PATH_CLASS.UNDER_TESTS:
      return arbitraryProtocolPath().map((protocol) => protocol.replace("/probes/", "/tests/"));
    case NON_PROTOCOL_PATH_CLASS.OUTSIDE_SPEC_TREE:
      return fc
        .tuple(
          arbitrarySlug().filter((dir) => dir !== "spx"),
          arbitraryNodeDirectoryName(OUTPUT_KINDS),
          arbitrarySlug(),
        )
        .map(([dir, node, slug]) => `${dir}/${node}/probes/${slug}/probe.md`);
    case NON_PROTOCOL_PATH_CLASS.UNDER_PRODUCT_ROOT:
      return arbitrarySlug().map((slug) => `spx/probes/${slug}/probe.md`);
    case NON_PROTOCOL_PATH_CLASS.UNDER_NESTED_PRODUCT:
      return fc
        .tuple(arbitraryNodeDirectoryName(["product"]), arbitrarySlug())
        .map(([product, slug]) => `spx/${product}/probes/${slug}/probe.md`);
    case NON_PROTOCOL_PATH_CLASS.NON_NODE_OWNER:
      return fc
        .tuple(arbitraryNodeDirectory(), arbitrarySlug(), arbitrarySlug())
        .map(([node, dir, slug]) => `${node}/${dir}/probes/${slug}/probe.md`);
    case NON_PROTOCOL_PATH_CLASS.NON_NODE_ANCESTOR:
      return fc
        .tuple(arbitrarySlug(), arbitraryNodeDirectoryName(OUTPUT_KINDS), arbitrarySlug())
        .map(([dir, node, slug]) => `spx/${dir}/${node}/probes/${slug}/probe.md`);
  }
}

/** One row of the probe scope-unit Mapping: the unit kind, its unit among a run's units, and its further field. */
export interface ProbeScopeUnitCase {
  readonly unitKind: string;
  readonly unitOf: (units: ProbeRunUnits) => Readonly<Record<string, unknown>>;
  readonly furtherField: string | undefined;
}

/** The rows of the probe scope-unit Mapping, one per unit kind, with the further field each requires. */
function probeScopeUnitCases(): readonly ProbeScopeUnitCase[] {
  return [
    { unitKind: PROBE_UNIT_KIND.PROTOCOL, unitOf: (units) => units.protocolUnit, furtherField: undefined },
    {
      unitKind: PROBE_UNIT_KIND.ASSERTION,
      unitOf: (units) => units.assertionUnit,
      furtherField: PROBE_PAYLOAD_FIELD.SLUG,
    },
    { unitKind: PROBE_UNIT_KIND.ARTIFACT, unitOf: (units) => units.artifactUnit, furtherField: undefined },
    {
      unitKind: PROBE_UNIT_KIND.UNEXERCISED,
      unitOf: (units) => units.unexercisedUnit,
      furtherField: PROBE_PAYLOAD_FIELD.REASON,
    },
  ];
}

/** One row of the probe terminal Mapping: the status supplied, whether a finding is recorded, and the outcome. */
export interface ProbeTerminalCase {
  readonly case: string;
  readonly terminalStatus: string;
  readonly withFinding: boolean;
  /** The statuses the refusal names; absent when `finish` seals the supplied status. */
  readonly named?: readonly string[];
}

/** The rows of the probe terminal Mapping, the foreign statuses each drawn with and without a finding. */
function probeTerminalCases(): readonly ProbeTerminalCase[] {
  const { PASSED, FAILED } = JOURNAL_RUN_STATE_STATUS;
  return [
    { case: "passed-clean", terminalStatus: PASSED, withFinding: false },
    { case: "passed-with-finding", terminalStatus: PASSED, withFinding: true, named: [FAILED] },
    { case: "failed-with-finding", terminalStatus: FAILED, withFinding: true },
    { case: "failed-clean", terminalStatus: FAILED, withFinding: false, named: [PASSED] },
    ...[JOURNAL_RUN_STATE_STATUS.APPROVED, JOURNAL_RUN_STATE_STATUS.REJECTED, JOURNAL_RUN_STATE_STATUS.INTERRUPTED]
      .flatMap((terminalStatus) =>
        [false, true].map((withFinding) => ({
          case: "foreign-status",
          terminalStatus,
          withFinding,
          named: [PASSED, FAILED],
        }))
      ),
  ];
}

export const PROBE_TEST_GENERATOR = {
  scopeUnitCases: probeScopeUnitCases,
  terminalCases: probeTerminalCases,
  slug: arbitrarySlug,
  protocolPath: arbitraryProtocolPath,
  artifactName: arbitraryArtifactName,
  runUnits: arbitraryProbeRunUnits,
  findingFor: probeFindingFor,
  nodePathShapes: () => Object.values(NODE_PATH_SHAPE),
  refusedArtifactClasses: () => Object.values(REFUSED_ARTIFACT_CLASS),
  refusedArtifactSubject: arbitraryRefusedArtifactSubject,
  nonProtocolPathClasses: () => Object.values(NON_PROTOCOL_PATH_CLASS),
  nonProtocolPath: arbitraryNonProtocolPath,
  protocolDirectory,
} as const;
