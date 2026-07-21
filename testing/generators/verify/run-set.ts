import * as fc from "fast-check";

import type { JournalRunMetadata, SealedJournalRun } from "@/domains/journal/run-scope";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  type FindingIdentityFields,
  MERGE_PERIOD_BACKEND,
  type MergePeriodBackend,
  type MergePeriodIdentity,
  type RunSetRunEvidence,
  type RunSetSelector,
} from "@/domains/verify/run-set";
import {
  type AuditFinding,
  type AuditScopeUnit,
  buildAppendEvent,
  buildRunContextEvent,
  buildTerminalEvent,
  type ReviewFinding,
  type ReviewScopeUnit,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyRunSelector,
  type VerifyScopeType,
} from "@/domains/verify/verify";
import {
  CLOUDEVENTS_SPECVERSION,
  JOURNAL_SEQ_BASE,
  type JournalEvent,
  type JournalEventInput,
  type JsonValue,
} from "@/lib/agent-run-journal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { arbitraryAuditFinding, arbitraryAuditScopeUnit } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";

const MERGE_PERIOD_BACKENDS = Object.values(MERGE_PERIOD_BACKEND);
const VERIFY_SCOPE_TYPES = Object.values(VERIFY_SCOPE_TYPE);
const VERIFY_VERIFICATION_TYPES = Object.values(VERIFY_VERIFICATION_TYPE);

/**
 * A generator-owned probe finding for the generic run-set projection: identity fields plus the
 * display metadata the spec declares non-identifying (line movement, provider record identifiers,
 * producer releases).
 */
export interface RunSetProbeFinding {
  readonly identity: FindingIdentityFields;
  readonly line?: number;
  readonly providerRecordIdentifier?: string;
  readonly producerRelease?: string;
}

/** A generator-owned probe scope unit: a coverage key plus display-only detail metadata. */
export interface RunSetProbeScopeUnit {
  readonly unitKey: string;
  readonly detail?: string;
}

/** The probe finding's identity extractor: the identity fields carried on the probe. */
export function probeFindingIdentity(finding: RunSetProbeFinding): FindingIdentityFields {
  return finding.identity;
}

/** The probe scope unit's coverage key. */
export function probeScopeUnitKey(unit: RunSetProbeScopeUnit): string {
  return unit.unitKey;
}

function isJsonRecordValue(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRecordOf(payload: JsonValue): { readonly [key: string]: JsonValue } {
  return isJsonRecordValue(payload) ? payload : {};
}

function stringFieldOf(record: { readonly [key: string]: JsonValue }, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/** A probe identity extractor over validated review finding payloads restored from run evidence. */
export function reviewPayloadProbeIdentity(payload: JsonValue): FindingIdentityFields {
  const record = jsonRecordOf(payload);
  const metadata = jsonRecordOf(record["finding"] ?? null);
  return {
    verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
    normalizedSubject: stringFieldOf(record, "path"),
    rule: stringFieldOf(metadata, "disposition"),
    fingerprint: stringFieldOf(metadata, "summary"),
  };
}

/** A probe coverage key over validated scope payloads restored from run evidence. */
export function jsonScopeUnitKey(unit: JsonValue): string {
  return JSON.stringify(unit);
}

function token(): fc.Arbitrary<string> {
  return STATE_STORE_TEST_GENERATOR.scopeToken();
}

function distinctTokens(count: number): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(token(), { minLength: count, maxLength: count });
}

function arbitraryIsoTimes(count: number): fc.Arbitrary<readonly string[]> {
  return fc
    .uniqueArray(fc.integer({ min: 0, max: 4_000_000_000_000 }), { minLength: count, maxLength: count })
    .map((epochs) => [...epochs].sort((left, right) => left - right).map((ms) => new Date(ms).toISOString()));
}

function arbitraryMergePeriodIdentity(backend: MergePeriodBackend): fc.Arbitrary<MergePeriodIdentity> {
  if (backend === MERGE_PERIOD_BACKEND.LOCAL) {
    return fc.record({
      backend: fc.constant(MERGE_PERIOD_BACKEND.LOCAL),
      branch: STATE_STORE_TEST_GENERATOR.branchSlug(),
    });
  }
  return fc.record({
    backend: fc.constant(MERGE_PERIOD_BACKEND.PULL_REQUEST),
    provider: token(),
    repository: token(),
    pullRequestNumber: fc.integer({ min: 1 }),
  });
}

function otherMergePeriod(identity: MergePeriodIdentity): MergePeriodIdentity {
  if (identity.backend === MERGE_PERIOD_BACKEND.LOCAL) {
    return { ...identity, branch: `${identity.branch}${identity.branch.length}` };
  }
  return { ...identity, pullRequestNumber: identity.pullRequestNumber + 1 };
}

function otherMember(values: readonly string[], current: string): string {
  const other = values.find((value) => value !== current);
  if (other === undefined) throw new Error("Run-set generator needs at least two registry members");
  return other;
}

function arbitraryIdentityFields(): fc.Arbitrary<FindingIdentityFields> {
  return fc.record(
    {
      verificationType: fc.constantFrom(...VERIFY_VERIFICATION_TYPES),
      stableActor: token(),
      normalizedSubject: token(),
      rule: token(),
      fingerprint: token(),
    },
    { requiredKeys: ["verificationType", "normalizedSubject", "rule", "fingerprint"] },
  );
}

function distinctIdentityFields(count: number): fc.Arbitrary<readonly FindingIdentityFields[]> {
  return fc.uniqueArray(arbitraryIdentityFields(), {
    minLength: count,
    maxLength: count,
    selector: (fields) => JSON.stringify(fields),
  });
}

function arbitraryDisplayMetadata(): fc.Arbitrary<Omit<RunSetProbeFinding, "identity">> {
  return fc.record(
    {
      line: fc.integer({ min: 1 }),
      providerRecordIdentifier: token(),
      producerRelease: token(),
    },
    { requiredKeys: [] },
  );
}

function probeFinding(identity: FindingIdentityFields): fc.Arbitrary<RunSetProbeFinding> {
  return arbitraryDisplayMetadata().map((display) => ({ identity, ...display }));
}

function probeFindings(identities: readonly FindingIdentityFields[]): fc.Arbitrary<readonly RunSetProbeFinding[]> {
  return fc.tuple(...identities.map((identity) => probeFinding(identity))).map((findings) => findings);
}

function probeUnits(keys: readonly string[]): readonly RunSetProbeScopeUnit[] {
  return keys.map((unitKey) => ({ unitKey }));
}

interface RunSetAddress {
  readonly mergePeriod: MergePeriodIdentity;
  readonly verificationType: string;
  readonly scopeType: VerifyScopeType;
  readonly runSetScopeKey: string;
}

function evidenceRun(
  address: RunSetAddress,
  runToken: string,
  scopeIdentity: string,
  recordedAt: string,
  scopeUnits: readonly RunSetProbeScopeUnit[],
  findings: readonly RunSetProbeFinding[],
): RunSetRunEvidence<RunSetProbeScopeUnit, RunSetProbeFinding> {
  return { ...address, runToken, scopeIdentity, recordedAt, scopeUnits, findings };
}

/** One selector-mapping case: a run set address, member and non-member runs, and the expected selection. */
export interface RunSetSelectorMappingCase {
  readonly backend: MergePeriodBackend;
  readonly selector: RunSetSelector;
  readonly runs: readonly RunSetRunEvidence<RunSetProbeScopeUnit, RunSetProbeFinding>[];
  readonly expectedPriorTokens: readonly string[];
  readonly expectedCurrentToken: string;
  readonly expectedScopeIdentityByToken: Readonly<Record<string, string>>;
  readonly expectedCurrentScopeKeys: readonly string[];
}

function arbitrarySelectorMappingCase(backend: MergePeriodBackend): fc.Arbitrary<RunSetSelectorMappingCase> {
  return fc
    .record({
      mergePeriod: arbitraryMergePeriodIdentity(backend),
      verificationType: fc.constantFrom(...VERIFY_VERIFICATION_TYPES),
      scopeType: fc.constantFrom(...VERIFY_SCOPE_TYPES),
      scopeKeys: distinctTokens(2),
      runTokens: distinctTokens(7),
      scopeIdentities: distinctTokens(7),
      unitKeys: distinctTokens(4),
      recordedAts: arbitraryIsoTimes(7),
      identities: distinctIdentityFields(2),
    })
    .chain((draw) =>
      probeFindings(draw.identities).map((findings) => {
        const [runSetScopeKey, foreignScopeKey] = draw.scopeKeys;
        const address: RunSetAddress = {
          mergePeriod: draw.mergePeriod,
          verificationType: draw.verificationType,
          scopeType: draw.scopeType,
          runSetScopeKey,
        };
        const memberTokens = draw.runTokens.slice(0, 3);
        const memberIdentities = draw.scopeIdentities.slice(0, 3);
        const memberTimes = draw.recordedAts.slice(0, 3);
        const members = memberTokens.map((runToken, index) =>
          evidenceRun(
            address,
            runToken,
            memberIdentities[index],
            memberTimes[index],
            index === memberTokens.length - 1 ? probeUnits(draw.unitKeys) : probeUnits(draw.unitKeys.slice(0, 2)),
            index === memberTokens.length - 1 ? findings : [],
          )
        );
        const nonMembers = [
          evidenceRun(
            { ...address, runSetScopeKey: foreignScopeKey },
            draw.runTokens[3],
            draw.scopeIdentities[3],
            draw.recordedAts[3],
            probeUnits(draw.unitKeys.slice(0, 1)),
            [],
          ),
          evidenceRun(
            { ...address, verificationType: otherMember(VERIFY_VERIFICATION_TYPES, draw.verificationType) },
            draw.runTokens[4],
            draw.scopeIdentities[4],
            draw.recordedAts[4],
            probeUnits(draw.unitKeys.slice(0, 1)),
            [],
          ),
          evidenceRun(
            { ...address, scopeType: otherMember(VERIFY_SCOPE_TYPES, draw.scopeType) as VerifyScopeType },
            draw.runTokens[5],
            draw.scopeIdentities[5],
            draw.recordedAts[5],
            probeUnits(draw.unitKeys.slice(0, 1)),
            [],
          ),
          evidenceRun(
            { ...address, mergePeriod: otherMergePeriod(draw.mergePeriod) },
            draw.runTokens[6],
            draw.scopeIdentities[6],
            draw.recordedAts[6],
            probeUnits(draw.unitKeys.slice(0, 1)),
            [],
          ),
        ];
        const current = members[members.length - 1];
        const shuffled = [
          members[1],
          nonMembers[0],
          current,
          nonMembers[1],
          members[0],
          nonMembers[2],
          nonMembers[3],
        ];
        return {
          backend,
          selector: address,
          runs: shuffled,
          expectedPriorTokens: memberTokens.slice(0, 2),
          expectedCurrentToken: current.runToken,
          expectedScopeIdentityByToken: Object.fromEntries(
            members.map((run) => [run.runToken, run.scopeIdentity]),
          ),
          expectedCurrentScopeKeys: draw.unitKeys,
        };
      })
    );
}

/** One case per merge-period backend, sampled deterministically. */
export function runSetSelectorMappingCases(): readonly RunSetSelectorMappingCase[] {
  return MERGE_PERIOD_BACKENDS.map((backend) => sampleVerifyTestValue(arbitrarySelectorMappingCase(backend)));
}

/** A finding-group and coverage-gap projection scenario with construction-derived expectations. */
export interface RunSetProjectionCase {
  readonly label: string;
  readonly selector: RunSetSelector;
  readonly runs: readonly RunSetRunEvidence<RunSetProbeScopeUnit, RunSetProbeFinding>[];
  readonly expectedActive: readonly RunSetProbeFinding[];
  readonly expectedResolved: readonly RunSetProbeFinding[];
  readonly expectedReopened: readonly RunSetProbeFinding[];
  readonly expectedGapUnits: readonly RunSetProbeScopeUnit[];
  readonly expectedCurrentScopeKeys: readonly string[];
}

function arbitraryProjectionCase(backend: MergePeriodBackend): fc.Arbitrary<RunSetProjectionCase> {
  return fc
    .record({
      mergePeriod: arbitraryMergePeriodIdentity(backend),
      verificationType: fc.constantFrom(...VERIFY_VERIFICATION_TYPES),
      scopeType: fc.constantFrom(...VERIFY_SCOPE_TYPES),
      runSetScopeKey: token(),
      runTokens: distinctTokens(4),
      scopeIdentities: distinctTokens(4),
      recordedAts: arbitraryIsoTimes(4),
      identities: distinctIdentityFields(4),
      unitKeys: distinctTokens(6),
      poisonIdentity: distinctIdentityFields(1),
      resolvedDisplays: distinctTokens(2),
      gapDetails: distinctTokens(2),
    })
    .chain((draw) => {
      const [newIdentity, continuingIdentity, resolvedIdentity, reopenedIdentity] = draw.identities;
      return fc
        .record({
          newCurrent: probeFinding(newIdentity),
          continuingPrior: probeFinding(continuingIdentity),
          continuingCurrent: probeFinding(continuingIdentity),
          resolvedPrior: probeFinding(resolvedIdentity),
          resolvedLatest: probeFinding(resolvedIdentity),
          reopenedEarlier: probeFinding(reopenedIdentity),
          reopenedCurrent: probeFinding(reopenedIdentity),
          poison: probeFinding(draw.poisonIdentity[0]),
        })
        .map((findings) => {
          const address: RunSetAddress = {
            mergePeriod: draw.mergePeriod,
            verificationType: draw.verificationType,
            scopeType: draw.scopeType,
            runSetScopeKey: draw.runSetScopeKey,
          };
          const [gapKeyRecurring, gapKeyLatestOnly] = draw.unitKeys;
          const [earlyGapDetail, latestGapDetail] = draw.gapDetails;
          const [earlyResolvedDisplay, latestResolvedDisplay] = draw.resolvedDisplays;
          const keptKeys = draw.unitKeys.slice(2, 4);
          const freshKeys = draw.unitKeys.slice(4, 6);
          const resolvedEarly = { ...findings.resolvedPrior, providerRecordIdentifier: earlyResolvedDisplay };
          const resolvedLatest = { ...findings.resolvedLatest, providerRecordIdentifier: latestResolvedDisplay };
          const gapUnitEarly = { unitKey: gapKeyRecurring, detail: earlyGapDetail };
          const gapUnitLatest = { unitKey: gapKeyRecurring, detail: latestGapDetail };
          const earlierPrior = evidenceRun(
            address,
            draw.runTokens[0],
            draw.scopeIdentities[0],
            draw.recordedAts[0],
            [gapUnitEarly, ...probeUnits(keptKeys)],
            [findings.reopenedEarlier, resolvedEarly, findings.continuingPrior],
          );
          const latestPrior = evidenceRun(
            address,
            draw.runTokens[1],
            draw.scopeIdentities[1],
            draw.recordedAts[1],
            [gapUnitLatest, { unitKey: gapKeyLatestOnly }, ...probeUnits(keptKeys)],
            [findings.continuingPrior, resolvedLatest],
          );
          const current = evidenceRun(
            address,
            draw.runTokens[2],
            draw.scopeIdentities[2],
            draw.recordedAts[2],
            probeUnits([...keptKeys, ...freshKeys]),
            [findings.newCurrent, findings.continuingCurrent, findings.reopenedCurrent],
          );
          const foreign = evidenceRun(
            { ...address, runSetScopeKey: `${draw.runSetScopeKey}${draw.runSetScopeKey.length}` },
            draw.runTokens[3],
            draw.scopeIdentities[3],
            draw.recordedAts[3],
            probeUnits(draw.unitKeys.slice(0, 1)),
            [findings.poison],
          );
          return {
            label: backend,
            selector: address,
            runs: [latestPrior, foreign, current, earlierPrior],
            expectedActive: [findings.newCurrent, findings.continuingCurrent],
            expectedResolved: [resolvedLatest],
            expectedReopened: [findings.reopenedCurrent],
            expectedGapUnits: [gapUnitLatest, { unitKey: gapKeyLatestOnly }],
            expectedCurrentScopeKeys: [...keptKeys, ...freshKeys],
          };
        });
    });
}

/** One projection case per merge-period backend, sampled deterministically. */
export function runSetProjectionCases(): readonly RunSetProjectionCase[] {
  return MERGE_PERIOD_BACKENDS.map((backend) => sampleVerifyTestValue(arbitraryProjectionCase(backend)));
}

/** A prior-context filter scenario: a type-provided selector narrows and drops prior context. */
export interface RunSetPriorContextFilterCase {
  readonly backend: MergePeriodBackend;
  readonly selector: RunSetSelector;
  readonly runs: readonly RunSetRunEvidence<RunSetProbeScopeUnit, RunSetProbeFinding>[];
  readonly keepRule: string;
  readonly droppedRunToken: string;
  readonly expectedResolved: readonly RunSetProbeFinding[];
  readonly excludedFingerprints: readonly string[];
}

function arbitraryPriorContextFilterCase(backend: MergePeriodBackend): fc.Arbitrary<RunSetPriorContextFilterCase> {
  return fc
    .record({
      mergePeriod: arbitraryMergePeriodIdentity(backend),
      verificationType: fc.constantFrom(...VERIFY_VERIFICATION_TYPES),
      scopeType: fc.constantFrom(...VERIFY_SCOPE_TYPES),
      runSetScopeKey: token(),
      rules: distinctTokens(2),
      runTokens: distinctTokens(3),
      scopeIdentities: distinctTokens(3),
      recordedAts: arbitraryIsoTimes(3),
      identities: distinctIdentityFields(4),
      fingerprints: distinctTokens(4),
    })
    .chain((draw) => {
      const [keepRule, dropRule] = draw.rules;
      const withRule = (index: number, rule: string): FindingIdentityFields => ({
        ...draw.identities[index],
        rule,
        fingerprint: draw.fingerprints[index],
      });
      return fc
        .record({
          keptSurviving: probeFinding(withRule(0, keepRule)),
          droppedByRule: probeFinding(withRule(1, dropRule)),
          keptOnDroppedRun: probeFinding(withRule(2, keepRule)),
          droppedByRuleOnDroppedRun: probeFinding(withRule(3, dropRule)),
        })
        .map((findings) => {
          const address: RunSetAddress = {
            mergePeriod: draw.mergePeriod,
            verificationType: draw.verificationType,
            scopeType: draw.scopeType,
            runSetScopeKey: draw.runSetScopeKey,
          };
          const survivingPrior = evidenceRun(
            address,
            draw.runTokens[0],
            draw.scopeIdentities[0],
            draw.recordedAts[0],
            [],
            [findings.keptSurviving, findings.droppedByRule],
          );
          const droppedPrior = evidenceRun(
            address,
            draw.runTokens[1],
            draw.scopeIdentities[1],
            draw.recordedAts[1],
            [],
            [findings.keptOnDroppedRun, findings.droppedByRuleOnDroppedRun],
          );
          const current = evidenceRun(
            address,
            draw.runTokens[2],
            draw.scopeIdentities[2],
            draw.recordedAts[2],
            [],
            [],
          );
          return {
            backend,
            selector: address,
            runs: [survivingPrior, droppedPrior, current],
            keepRule,
            droppedRunToken: droppedPrior.runToken,
            expectedResolved: [findings.keptSurviving],
            excludedFingerprints: [
              findings.droppedByRule.identity.fingerprint,
              findings.keptOnDroppedRun.identity.fingerprint,
              findings.droppedByRuleOnDroppedRun.identity.fingerprint,
            ],
          };
        });
    });
}

/** One prior-context filter case per merge-period backend, sampled deterministically. */
export function runSetPriorContextFilterCases(): readonly RunSetPriorContextFilterCase[] {
  return MERGE_PERIOD_BACKENDS.map((backend) => sampleVerifyTestValue(arbitraryPriorContextFilterCase(backend)));
}

/** An identity-stability scenario: one identity under display-only mutation and one identity-field mutation. */
export interface FindingIdentityStabilityScenario {
  readonly first: RunSetProbeFinding;
  readonly second: RunSetProbeFinding;
  readonly mutated: FindingIdentityFields;
}

const IDENTITY_FIELD_NAMES = ["verificationType", "stableActor", "normalizedSubject", "rule", "fingerprint"] as const;

/** Identity scenarios pairing display-only variants with a single mutated identity field. */
export function arbitraryFindingIdentityStabilityScenario(): fc.Arbitrary<FindingIdentityStabilityScenario> {
  return fc
    .record({
      identity: arbitraryIdentityFields(),
      mutatedField: fc.constantFrom(...IDENTITY_FIELD_NAMES),
      replacement: token(),
    })
    .chain((draw) =>
      fc.record({ first: probeFinding(draw.identity), second: probeFinding(draw.identity) }).map((pair) => {
        const currentValue = draw.identity[draw.mutatedField];
        const replacement = currentValue === draw.replacement ? `${draw.replacement}-mutated` : draw.replacement;
        return {
          first: pair.first,
          second: pair.second,
          mutated: { ...draw.identity, [draw.mutatedField]: replacement },
        };
      })
    );
}

function stampEvents(
  inputs: readonly JournalEventInput[],
  streamid: string,
  runid: string,
): readonly JournalEvent[] {
  return inputs.map((input, index) => ({
    ...input,
    specversion: CLOUDEVENTS_SPECVERSION,
    streamid,
    runid,
    seq: JOURNAL_SEQ_BASE + index,
  }));
}

function reviewScopePayload(unit: ReviewScopeUnit): JsonValue {
  return {
    path: unit.path,
    side: unit.side,
    commit: unit.commit,
    coverageState: unit.coverageState,
    ...(unit.providerIdentity === undefined ? {} : { providerIdentity: unit.providerIdentity }),
    ...(unit.line === undefined ? {} : { line: unit.line }),
    ...(unit.position === undefined ? {} : { position: unit.position }),
    ...(unit.url === undefined ? {} : { url: unit.url }),
  };
}

function reviewFindingPayload(finding: ReviewFinding): JsonValue {
  return {
    path: finding.path,
    side: finding.side,
    originalCommit: finding.originalCommit,
    diffHunk: finding.diffHunk,
    body: finding.body,
    finding: { disposition: finding.finding.disposition, summary: finding.finding.summary },
    ...(finding.providerIdentity === undefined ? {} : { providerIdentity: finding.providerIdentity }),
    ...(finding.line === undefined ? {} : { line: finding.line }),
    ...(finding.position === undefined ? {} : { position: finding.position }),
    ...(finding.url === undefined ? {} : { url: finding.url }),
  };
}

function runMetadata(args: {
  readonly runToken: string;
  readonly type: string;
  readonly branchSlug: string;
  readonly productDir: string;
  readonly startedAt: string;
  readonly createdAtMs: number;
  readonly eventCount: number;
}): JournalRunMetadata {
  return {
    productDir: args.productDir,
    branchSlug: args.branchSlug,
    type: args.type,
    runToken: args.runToken,
    runFilePath: `${args.productDir}/runs/run-${args.runToken}.jsonl`,
    runFileName: `run-${args.runToken}.jsonl`,
    startedAt: args.startedAt,
    createdAtMs: args.createdAtMs,
    sealed: true,
    eventCount: args.eventCount,
    terminalState: JOURNAL_RUN_STATE_STATUS.REJECTED,
  };
}

/** A boundary scenario: one review run's evidence under noise-event and envelope-variant histories. */
export interface RunSetBoundaryScenario {
  readonly verificationType: string;
  readonly runSelector: VerifyRunSelector;
  readonly priorRun: SealedJournalRun;
  readonly noisyPriorRun: SealedJournalRun;
  readonly envelopeVariantPriorRun: SealedJournalRun;
  readonly currentRun: SealedJournalRun;
  readonly expectedScopePayloads: readonly JsonValue[];
  readonly expectedFindingPayloads: readonly JsonValue[];
  readonly renderedNoiseMarker: string;
  readonly scopeIdentityByToken: Readonly<Record<string, string>>;
}

function arbitraryBoundaryScenario(): fc.Arbitrary<RunSetBoundaryScenario> {
  return fc
    .record({
      scopeUnit: VERIFY_TEST_GENERATOR.scopePayload(),
      finding: VERIFY_TEST_GENERATOR.reviewFinding(),
      scopeType: fc.constantFrom(...VERIFY_SCOPE_TYPES),
      scopeIdentities: distinctTokens(2),
      runTokens: distinctTokens(2),
      idempotencyKeys: distinctTokens(2),
      envelopeTokens: distinctTokens(6),
      noiseMarker: token().map((value) => `${value}-rendered-noise`),
      branchSlug: STATE_STORE_TEST_GENERATOR.branchSlug(),
      productDir: token(),
      epochMs: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    })
    .map((draw) => {
      const [priorToken, currentToken] = draw.runTokens;
      const [scopeKey, findingKey] = draw.idempotencyKeys;
      const at = new Date(draw.epochMs);
      const scopePayload = reviewScopePayload(draw.scopeUnit);
      const findingPayload = reviewFindingPayload(draw.finding);
      const evidenceInputs: readonly JournalEventInput[] = [
        buildRunContextEvent({ runToken: priorToken, driveMode: VERIFY_DRIVE_MODE.CALLER, at }),
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
          idempotencyKey: scopeKey,
          payload: scopePayload,
          at,
        }),
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.FINDING,
          idempotencyKey: findingKey,
          payload: findingPayload,
          at,
        }),
        buildTerminalEvent({
          runToken: priorToken,
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          at,
        }),
      ];
      const noiseInputs: readonly JournalEventInput[] = [
        {
          id: `${draw.envelopeTokens[0]}-comment`,
          source: `/${draw.envelopeTokens[1]}/rendered`,
          type: `com.${draw.envelopeTokens[2]}.pull-request.comment.rendered`,
          time: at.toISOString(),
          attempt: 1,
          data: { markdown: `### ${draw.noiseMarker}\n\n- ${draw.noiseMarker}` },
        },
        {
          id: `${draw.envelopeTokens[0]}-terminal-output`,
          source: `/${draw.envelopeTokens[1]}/terminal`,
          type: `com.${draw.envelopeTokens[2]}.terminal-output`,
          time: at.toISOString(),
          attempt: 1,
          data: { text: `[31m${draw.noiseMarker}[0m` },
        },
      ];
      const noisyInputs = [
        evidenceInputs[0],
        noiseInputs[0],
        evidenceInputs[1],
        noiseInputs[1],
        evidenceInputs[2],
        evidenceInputs[3],
      ];
      const baseEvents = stampEvents(
        evidenceInputs,
        draw.envelopeTokens[3],
        priorToken,
      );
      const envelopeVariantEvents = stampEvents(
        evidenceInputs.map((input, index) => ({ ...input, id: `${draw.envelopeTokens[4]}-${index}` })),
        draw.envelopeTokens[5],
        `${priorToken}-republished`,
      );
      const currentEvents = stampEvents(
        [
          buildRunContextEvent({ runToken: currentToken, driveMode: VERIFY_DRIVE_MODE.CALLER, at }),
          buildTerminalEvent({
            runToken: currentToken,
            terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
            at,
          }),
        ],
        draw.envelopeTokens[3],
        currentToken,
      );
      const metadataFor = (runToken: string, eventCount: number, startedAtMs: number): JournalRunMetadata =>
        runMetadata({
          runToken,
          type: VERIFY_VERIFICATION_TYPE.REVIEW,
          branchSlug: draw.branchSlug,
          productDir: draw.productDir,
          startedAt: new Date(startedAtMs).toISOString(),
          createdAtMs: startedAtMs,
          eventCount,
        });
      const [priorScopeIdentity, currentScopeIdentity] = draw.scopeIdentities;
      return {
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        runSelector: { scopeType: draw.scopeType, scopeIdentity: priorScopeIdentity },
        priorRun: {
          runToken: priorToken,
          metadata: metadataFor(priorToken, baseEvents.length, draw.epochMs),
          events: baseEvents,
        },
        noisyPriorRun: {
          runToken: priorToken,
          metadata: metadataFor(priorToken, noisyInputs.length, draw.epochMs),
          events: stampEvents(noisyInputs, draw.envelopeTokens[3], priorToken),
        },
        envelopeVariantPriorRun: {
          runToken: priorToken,
          metadata: metadataFor(priorToken, envelopeVariantEvents.length, draw.epochMs),
          events: envelopeVariantEvents,
        },
        currentRun: {
          runToken: currentToken,
          metadata: metadataFor(currentToken, currentEvents.length, draw.epochMs + 1),
          events: currentEvents,
        },
        expectedScopePayloads: [scopePayload],
        expectedFindingPayloads: [findingPayload],
        renderedNoiseMarker: draw.noiseMarker,
        scopeIdentityByToken: {
          [priorToken]: priorScopeIdentity,
          [currentToken]: currentScopeIdentity,
        },
      };
    })
    .filter((scenario) => !JSON.stringify(scenario.priorRun.events).includes(scenario.renderedNoiseMarker));
}

/** One boundary scenario, sampled deterministically. */
export function sampleRunSetBoundaryScenario(): RunSetBoundaryScenario {
  return sampleVerifyTestValue(arbitraryBoundaryScenario());
}

/** An audit-run boundary scenario: a root scope, a child scope, and a finding, restored in order. */
export interface RunSetAuditBoundaryScenario {
  readonly verificationType: string;
  readonly runSelector: VerifyRunSelector;
  readonly events: readonly JournalEvent[];
  readonly expectedScopePayloads: readonly JsonValue[];
  readonly expectedFindingPayloads: readonly JsonValue[];
}

function auditPayload(value: AuditFinding | AuditScopeUnit): JsonValue {
  return structuredClone(value) as unknown as JsonValue;
}

function arbitraryAuditBoundaryScenario(): fc.Arbitrary<RunSetAuditBoundaryScenario> {
  return fc
    .record({
      rootDraw: arbitraryAuditScopeUnit(),
      childDraw: arbitraryAuditScopeUnit(),
      findingDraw: arbitraryAuditFinding(),
      runToken: token(),
      scopeIdentity: token(),
      idempotencyKeys: distinctTokens(3),
      streamToken: token(),
      epochMs: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    })
    .filter((draw) => draw.rootDraw.unitId !== draw.childDraw.unitId)
    .map((draw) => {
      const { parentUnitId: _rootParent, ...root } = draw.rootDraw;
      const child: AuditScopeUnit = { ...draw.childDraw, parentUnitId: root.unitId };
      const finding: AuditFinding = { ...draw.findingDraw, unitId: child.unitId };
      const [rootKey, childKey, findingKey] = draw.idempotencyKeys;
      const at = new Date(draw.epochMs);
      const rootPayload = auditPayload(root);
      const childPayload = auditPayload(child);
      const findingPayload = auditPayload(finding);
      const inputs: readonly JournalEventInput[] = [
        buildRunContextEvent({ runToken: draw.runToken, driveMode: VERIFY_DRIVE_MODE.CALLER, at }),
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
          idempotencyKey: rootKey,
          payload: rootPayload,
          at,
        }),
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
          idempotencyKey: childKey,
          payload: childPayload,
          at,
        }),
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.FINDING,
          idempotencyKey: findingKey,
          payload: findingPayload,
          at,
        }),
        buildTerminalEvent({
          runToken: draw.runToken,
          terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED,
          at,
        }),
      ];
      return {
        verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
        runSelector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: draw.scopeIdentity },
        events: stampEvents(inputs, draw.streamToken, draw.runToken),
        expectedScopePayloads: [rootPayload, childPayload],
        expectedFindingPayloads: [findingPayload],
      };
    });
}

/** One audit-run boundary scenario, sampled deterministically. */
export function sampleRunSetAuditBoundaryScenario(): RunSetAuditBoundaryScenario {
  return sampleVerifyTestValue(arbitraryAuditBoundaryScenario());
}

/** The run-set generator surface for run-set orchestration tests. */
export const RUN_SET_TEST_GENERATOR = {
  findingIdentityStabilityScenario: arbitraryFindingIdentityStabilityScenario,
} as const;
