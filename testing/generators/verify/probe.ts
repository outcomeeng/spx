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

/** A Node directory under `spx/`: an index, a slug, and an output kind. */
function arbitraryNodeDirectory(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: 10, max: 99 }), arbitrarySlug(), fc.constantFrom("enabler", "capability", "domain"))
    .map(([index, slug, kind]) => `spx/${index}-${slug}.${kind}`);
}

/** A probe protocol path: a `probe.md` directly inside a directory under a Node's `probes/`. */
function arbitraryProtocolPath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryNodeDirectory(), arbitrarySlug())
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

function arbitraryProbeRunUnits(): fc.Arbitrary<ProbeRunUnits> {
  return fc
    .tuple(
      arbitraryProtocolPath(),
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

/**
 * An artifact subject the probe form refuses for a protocol: a file under the directory's `runs/`,
 * a file in another subdirectory, `probe.md` itself, a name outside `<slug>.<ext>`, or a file beside
 * another protocol.
 */
function arbitraryRefusedArtifactSubject(protocol: string): fc.Arbitrary<string> {
  const directory = protocolDirectory(protocol);
  return fc.oneof(
    arbitraryArtifactName().map((name) => `${directory}/runs/${name}`),
    fc.tuple(arbitrarySlug(), arbitraryArtifactName()).map(([sub, name]) => `${directory}/${sub}/${name}`),
    fc.constant(`${directory}/probe.md`),
    arbitrarySlug().map((name) => `${directory}/${name}`),
    arbitraryArtifactName().map((name) => `${directory}-other/${name}`),
  );
}

/** A path that is no probe protocol: not `probe.md`, not directly in a probe directory, or not under `probes/`. */
function arbitraryNonProtocolPath(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryProtocolPath().map((protocol) => protocol.replace(/probe\.md$/, "notes.md")),
    arbitraryProtocolPath().map((protocol) => protocol.replace("/probe.md", "/deeper/probe.md")),
    arbitraryProtocolPath().map((protocol) => protocol.replace("/probes/", "/tests/")),
    arbitrarySlug().map((slug) => `probes/${slug}/probe.md`),
  );
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
  refusedArtifactSubject: arbitraryRefusedArtifactSubject,
  nonProtocolPath: arbitraryNonProtocolPath,
  protocolDirectory,
} as const;
