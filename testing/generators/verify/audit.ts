import * as fc from "fast-check";

import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  AUDIT_FINDING_SEVERITY,
  AUDIT_KIND,
  type AuditFinding,
  type AuditProducerIdentity,
  type AuditProducerProvenance,
  type AuditScopeUnit,
  buildAppendEvent,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_SCOPE_SEPARATOR,
  type VerifyAppendEventType,
} from "@/domains/verify/verify";
import { CLOUDEVENTS_SPECVERSION, JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";

const AUDIT_COVERAGE_REQUIREMENTS = Object.values(AUDIT_COVERAGE_REQUIREMENT);
const AUDIT_COVERAGE_STATUSES = Object.values(AUDIT_COVERAGE_STATUS);
const AUDIT_COVERED_COVERAGE_STATUSES = [
  AUDIT_COVERAGE_STATUS.AUDITED,
  AUDIT_COVERAGE_STATUS.NOT_APPLICABLE,
] as const;
const AUDIT_UNCOVERED_COVERAGE_STATUSES = AUDIT_COVERAGE_STATUSES.filter((status) =>
  status !== AUDIT_COVERAGE_STATUS.AUDITED && status !== AUDIT_COVERAGE_STATUS.NOT_APPLICABLE
);
const AUDIT_FINDING_SEVERITIES = Object.values(AUDIT_FINDING_SEVERITY);

export interface FileAuditScopeScenario {
  readonly scopeIdentity: string;
  readonly relatedSubject: string;
  readonly rootPayload: JsonValue;
  readonly childPayload: JsonValue;
  readonly mismatchedRootPayload: JsonValue;
  readonly parentedRootPayload: JsonValue;
  readonly optionalRootPayload: JsonValue;
  readonly mismatchedRootEvent: JournalEvent;
  readonly orphanChildPayload: JsonValue;
  readonly duplicateRootEvent: JournalEvent;
  readonly rootEvent: JournalEvent;
  readonly childEvent: JournalEvent;
  readonly requiredNotApplicableEvent: JournalEvent;
  readonly optionalUncoveredEvent: JournalEvent;
  readonly requiredUncoveredEvents: readonly JournalEvent[];
  readonly requiredCoverageGapEvent: JournalEvent;
  readonly findingEvents: readonly JournalEvent[];
}

export interface AuditChangesetProjectionScenario {
  readonly rootPayload: JsonValue;
  readonly specPayload: JsonValue;
  readonly implementationPayload: JsonValue;
  readonly rootEvent: JournalEvent;
  readonly specEvent: JournalEvent;
  readonly implementationEvent: JournalEvent;
}

function arbitraryAuditProducerIdentity(): fc.Arbitrary<AuditProducerIdentity> {
  return fc.record({
    producerKind: STATE_STORE_TEST_GENERATOR.scopeToken(),
    agentName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    agentOwningPluginName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    skillName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    skillOwningPluginName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    invocationRole: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

export function arbitraryAuditProducerProvenance(): fc.Arbitrary<AuditProducerProvenance> {
  return fc.record({
    agentOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
    skillOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
    toolVersion: fc.option(STATE_STORE_TEST_GENERATOR.scopeToken(), { nil: undefined }),
  });
}

interface AuditClassKind {
  readonly auditClass: AuditScopeUnit["auditClass"];
  readonly auditKind: AuditScopeUnit["auditKind"];
}

function arbitraryExecutedAuditClassKind(): fc.Arbitrary<AuditClassKind> {
  return fc.oneof(
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.INSTRUCTIONS),
      auditKind: fc.constantFrom(AUDIT_KIND.SKILL, AUDIT_KIND.SUBAGENT, AUDIT_KIND.PROMPT, AUDIT_KIND.GUIDE_TEMPLATE),
    }),
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.SPEC),
      auditKind: fc.constantFrom(AUDIT_KIND.SPEC, AUDIT_KIND.ADR, AUDIT_KIND.PDR),
    }),
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.IMPLEMENTATION),
      auditKind: fc.constantFrom(AUDIT_KIND.CODE, AUDIT_KIND.TESTS, AUDIT_KIND.ARCHITECTURE, AUDIT_KIND.EVAL_EVIDENCE),
    }),
  );
}

function arbitraryAuditScopeFields(): fc.Arbitrary<Omit<AuditScopeUnit, keyof AuditClassKind>> {
  return fc.record({
    unitId: STATE_STORE_TEST_GENERATOR.scopeToken(),
    parentUnitId: fc.option(STATE_STORE_TEST_GENERATOR.scopeToken(), { nil: undefined }),
    subject: arbitrarySourceFilePath(),
    coverageRequirement: fc.constantFrom(...AUDIT_COVERAGE_REQUIREMENTS),
    coverageStatus: fc.constantFrom(...AUDIT_COVERAGE_STATUSES),
    priorContext: fc.record({
      changedFilePartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
      concernPartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
      languagePartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
    expectedProducer: arbitraryAuditProducerIdentity(),
    recordedByRunDriver: arbitraryAuditProducerIdentity(),
    producerProvenance: arbitraryAuditProducerProvenance(),
  });
}

export function arbitraryAuditScopeUnit(): fc.Arbitrary<AuditScopeUnit> {
  return fc
    .oneof(
      arbitraryExecutedAuditScopeUnit(),
      fc
        .tuple(
          fc.constantFrom(...Object.values(AUDIT_CLASS)),
          arbitraryAuditScopeFields(),
          fc.constantFrom(...AUDIT_UNCOVERED_COVERAGE_STATUSES),
        )
        .map(([auditClass, { producerProvenance: _producerProvenance, ...fields }, coverageStatus]) => ({
          ...fields,
          auditClass,
          auditKind: AUDIT_KIND.COVERAGE_GAP,
          coverageStatus,
        })),
    )
    .filter((unit) => unit.parentUnitId !== unit.unitId);
}

function arbitraryExecutedAuditScopeUnit(): fc.Arbitrary<AuditScopeUnit> {
  return fc.tuple(arbitraryExecutedAuditClassKind(), arbitraryAuditScopeFields()).map(([kind, fields]) => ({
    ...fields,
    auditClass: kind.auditClass,
    auditKind: kind.auditKind,
  }));
}

export function arbitraryAuditFinding(): fc.Arbitrary<AuditFinding> {
  return fc.record({
    unitId: STATE_STORE_TEST_GENERATOR.scopeToken(),
    producerIdentity: arbitraryAuditProducerIdentity(),
    producerProvenance: arbitraryAuditProducerProvenance(),
    rule: STATE_STORE_TEST_GENERATOR.scopeToken(),
    severity: fc.constantFrom(...AUDIT_FINDING_SEVERITIES),
    location: arbitrarySourceFilePath(),
    message: STATE_STORE_TEST_GENERATOR.scopeToken(),
    evidence: fc.record({
      observed: STATE_STORE_TEST_GENERATOR.scopeToken(),
      expected: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
  });
}

function auditScopePayload(unit: AuditScopeUnit): JsonValue {
  return JSON.parse(JSON.stringify(unit)) as JsonValue;
}

export function arbitraryAuditScopePayload(): fc.Arbitrary<JsonValue> {
  return fc.oneof(
    arbitraryAuditScopeUnit().map(auditScopePayload),
    arbitraryAuditScopeUnit().map(({ producerProvenance: _producerProvenance, ...unit }) =>
      JSON.parse(JSON.stringify(unit)) as JsonValue
    ),
    arbitraryAuditScopeUnit().map((unit) =>
      JSON.parse(JSON.stringify({
        ...unit,
        parentUnitId: undefined,
        priorContext: {
          changedFilePartition: unit.priorContext.changedFilePartition,
          concernPartition: unit.priorContext.concernPartition,
        },
      })) as JsonValue
    ),
  );
}

function auditEvent(
  eventType: VerifyAppendEventType,
  idempotencyKey: string,
  payload: JsonValue,
  sequence: number,
): JournalEvent {
  return {
    ...buildAppendEvent({ eventType, idempotencyKey, payload, at: new Date(0) }),
    specversion: CLOUDEVENTS_SPECVERSION,
    streamid: idempotencyKey,
    seq: sequence,
    runid: idempotencyKey,
  };
}

export function auditScopeEvent(unit: AuditScopeUnit, sequence: number = JOURNAL_SEQ_BASE): JournalEvent {
  return auditEvent(VERIFY_APPEND_EVENT_TYPE.SCOPE, unit.unitId, auditScopePayload(unit), sequence);
}

function arbitraryInvalidAuditScopeUnit(): fc.Arbitrary<JsonValue> {
  return fc.oneof(
    fc.constant(null),
    fc.integer(),
    fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
    arbitraryAuditScopeUnit().map(({ unitId: _unitId, ...unit }) => unit),
    arbitraryAuditScopeUnit().map((unit) => ({
      ...unit,
      auditClass: AUDIT_CLASS.IMPLEMENTATION,
      auditKind: AUDIT_KIND.SKILL,
    })),
    arbitraryAuditScopeUnit().map((unit) => ({ ...unit, parentUnitId: unit.unitId })),
    fc
      .tuple(
        arbitraryExecutedAuditScopeUnit(),
        fc.constantFrom(...AUDIT_COVERED_COVERAGE_STATUSES),
      )
      .map(([unit, coverageStatus]) => {
        const { producerProvenance: _producerProvenance, ...fields } = unit;
        return auditScopePayload({
          ...fields,
          auditKind: AUDIT_KIND.COVERAGE_GAP,
          coverageStatus,
        });
      }),
  ) as fc.Arbitrary<JsonValue>;
}

export function invalidCoveredCoverageGapAuditScopePayloads(): readonly JsonValue[] {
  const { producerProvenance: _producerProvenance, ...fields } = sampleVerifyTestValue(
    arbitraryExecutedAuditScopeUnit(),
  );
  return AUDIT_COVERED_COVERAGE_STATUSES.map((coverageStatus) =>
    auditScopePayload({
      ...fields,
      auditKind: AUDIT_KIND.COVERAGE_GAP,
      coverageStatus,
    })
  );
}

function arbitraryInvalidAuditFinding(): fc.Arbitrary<JsonValue> {
  return fc.oneof(
    fc.constant(null),
    fc.integer(),
    fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
    arbitraryAuditFinding().map(({ unitId: _unitId, ...finding }) => finding),
    arbitraryAuditFinding().map((finding) => ({ ...finding, evidence: {} })),
  ) as fc.Arbitrary<JsonValue>;
}

export interface InvalidAuditPayloadScenario {
  readonly payload: JsonValue;
  readonly scopeIdentity: string;
}

export function arbitraryInvalidAuditScopeScenario(): fc.Arbitrary<InvalidAuditPayloadScenario> {
  return fc.record({
    payload: arbitraryInvalidAuditScopeUnit(),
    scopeIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

export function arbitraryInvalidAuditFindingScenario(): fc.Arbitrary<InvalidAuditPayloadScenario> {
  return fc.record({
    payload: arbitraryInvalidAuditFinding(),
    scopeIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

export interface AuditFindingValidationScenario {
  readonly scopeIdentity: string;
  readonly scope: AuditScopeUnit;
  readonly scopeEvent: JournalEvent;
  readonly finding: AuditFinding;
  readonly unknownUnitFinding: AuditFinding;
  readonly emptyEvidenceFinding: JsonValue;
}

export function arbitraryAuditFindingValidationScenario(): fc.Arbitrary<AuditFindingValidationScenario> {
  return fc
    .tuple(
      arbitraryAuditScopeUnit(),
      arbitraryAuditFinding(),
      STATE_STORE_TEST_GENERATOR.scopeToken(),
      STATE_STORE_TEST_GENERATOR.scopeToken(),
    )
    .filter(([scope, _finding, unknownUnitId]) => scope.unitId !== unknownUnitId)
    .map(([scope, finding, unknownUnitId, scopeIdentity]) => ({
      scopeIdentity,
      scope,
      scopeEvent: auditScopeEvent(scope),
      finding: { ...finding, unitId: scope.unitId },
      unknownUnitFinding: { ...finding, unitId: unknownUnitId },
      emptyEvidenceFinding: JSON.parse(JSON.stringify({ ...finding, unitId: scope.unitId, evidence: {} })) as JsonValue,
    }));
}

export interface AuditPriorContextScenario {
  readonly current: AuditScopeUnit;
  readonly currentWithoutProvenance: AuditScopeUnit;
  readonly mismatches: readonly AuditScopeUnit[];
}

export function arbitraryAuditPriorContextScenario(): fc.Arbitrary<AuditPriorContextScenario> {
  return arbitraryAuditScopeUnit().chain((candidate) =>
    fc
      .uniqueArray(STATE_STORE_TEST_GENERATOR.scopeToken(), { minLength: 6, maxLength: 6 })
      .filter((alternates) =>
        !alternates.includes(candidate.subject)
        && !alternates.includes(candidate.priorContext.changedFilePartition)
        && !alternates.includes(candidate.priorContext.concernPartition)
        && !alternates.includes(candidate.priorContext.languagePartition ?? candidate.subject)
        && !alternates.includes(candidate.expectedProducer.invocationRole)
        && !alternates.includes(candidate.recordedByRunDriver.invocationRole)
      )
      .map((alternates) => {
        const current: AuditScopeUnit = {
          ...candidate,
          auditClass: AUDIT_CLASS.IMPLEMENTATION,
          auditKind: AUDIT_KIND.ARCHITECTURE,
        };
        const { producerProvenance: _producerProvenance, ...currentWithoutProvenance } = current;
        return {
          current,
          currentWithoutProvenance,
          mismatches: [
            { ...current, auditClass: AUDIT_CLASS.SPEC },
            { ...current, auditKind: AUDIT_KIND.CODE },
            {
              ...current,
              expectedProducer: { ...current.expectedProducer, invocationRole: alternates[0] },
            },
            {
              ...current,
              recordedByRunDriver: { ...current.recordedByRunDriver, invocationRole: alternates[1] },
            },
            { ...current, subject: alternates[2] },
            {
              ...current,
              priorContext: { ...current.priorContext, changedFilePartition: alternates[3] },
            },
            {
              ...current,
              priorContext: { ...current.priorContext, concernPartition: alternates[4] },
            },
            {
              ...current,
              priorContext: { ...current.priorContext, languagePartition: alternates[5] },
            },
          ],
        };
      })
  );
}

export function arbitrarySuppliedAuditTerminalMetadata(): fc.Arbitrary<JsonValue> {
  return fc.record({
    actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
    state: STATE_STORE_TEST_GENERATOR.scopeToken(),
    submittedAt: fc.date({ noInvalidDate: true }).map((date) => date.toISOString()),
  });
}

export interface AuditTerminalMetadataScenario {
  readonly scope: FileAuditScopeScenario;
  readonly metadata: JsonValue;
}

export function arbitraryAuditTerminalMetadataScenario(): fc.Arbitrary<AuditTerminalMetadataScenario> {
  return fc.record({
    scope: arbitraryFileAuditScopeScenario(),
    metadata: arbitrarySuppliedAuditTerminalMetadata(),
  });
}

function auditFindingEvent(finding: AuditFinding, sequence: number): JournalEvent {
  return auditEvent(
    VERIFY_APPEND_EVENT_TYPE.FINDING,
    finding.unitId,
    JSON.parse(JSON.stringify(finding)) as JsonValue,
    sequence,
  );
}

export function arbitraryAuditChangesetProjectionScenario(): fc.Arbitrary<AuditChangesetProjectionScenario> {
  return fc
    .tuple(
      VERIFY_TEST_GENERATOR.changesetScopeScenario(),
      arbitraryExecutedAuditScopeUnit(),
      arbitraryExecutedAuditScopeUnit(),
      arbitraryExecutedAuditScopeUnit(),
    )
    .filter(([_changeset, root, spec, implementation]) =>
      root.unitId !== spec.unitId
      && root.unitId !== implementation.unitId
      && spec.unitId !== implementation.unitId
    )
    .map(([changeset, rootCandidate, specCandidate, implementationCandidate]) => {
      const { parentUnitId: _rootParent, ...rootFields } = rootCandidate;
      const root: AuditScopeUnit = {
        ...rootFields,
        auditClass: AUDIT_CLASS.INSTRUCTIONS,
        auditKind: AUDIT_KIND.SUBAGENT,
        subject: `${changeset.range.base}${VERIFY_SCOPE_SEPARATOR}${changeset.range.head}`,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      const spec: AuditScopeUnit = {
        ...specCandidate,
        parentUnitId: root.unitId,
        auditClass: AUDIT_CLASS.SPEC,
        auditKind: AUDIT_KIND.SPEC,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      const implementation: AuditScopeUnit = {
        ...implementationCandidate,
        parentUnitId: root.unitId,
        auditClass: AUDIT_CLASS.IMPLEMENTATION,
        auditKind: AUDIT_KIND.CODE,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      return {
        rootPayload: auditScopePayload(root),
        specPayload: auditScopePayload(spec),
        implementationPayload: auditScopePayload(implementation),
        rootEvent: auditScopeEvent(root, JOURNAL_SEQ_BASE),
        specEvent: auditScopeEvent(spec, JOURNAL_SEQ_BASE + 1),
        implementationEvent: auditScopeEvent(implementation, JOURNAL_SEQ_BASE + 2),
      };
    });
}

export function arbitraryFileAuditScopeScenario(): fc.Arbitrary<FileAuditScopeScenario> {
  return fc
    .tuple(
      arbitrarySourceFilePath(),
      arbitrarySourceFilePath(),
      arbitraryExecutedAuditScopeUnit(),
      arbitraryExecutedAuditScopeUnit(),
      arbitraryExecutedAuditScopeUnit(),
      arbitraryAuditFinding(),
      STATE_STORE_TEST_GENERATOR.scopeToken(),
    )
    .filter(([scopeIdentity, relatedSubject, root, child, duplicateRoot, _finding, orphanParent]) =>
      scopeIdentity !== relatedSubject
      && root.unitId !== child.unitId
      && root.unitId !== duplicateRoot.unitId
      && child.unitId !== duplicateRoot.unitId
      && orphanParent !== root.unitId
      && orphanParent !== child.unitId
    )
    .map(([scopeIdentity, relatedSubject, rootCandidate, childCandidate, duplicateCandidate, finding, orphan]) => {
      const { parentUnitId: _rootParent, ...rootFields } = rootCandidate;
      const { parentUnitId: _duplicateParent, ...duplicateFields } = duplicateCandidate;
      const root: AuditScopeUnit = {
        ...rootFields,
        subject: scopeIdentity,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      const child: AuditScopeUnit = {
        ...childCandidate,
        parentUnitId: root.unitId,
        subject: relatedSubject,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.OPTIONAL,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      const duplicateRoot: AuditScopeUnit = {
        ...duplicateFields,
        subject: scopeIdentity,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
      };
      const requiredNotApplicable: AuditScopeUnit = {
        ...child,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.NOT_APPLICABLE,
      };
      const optionalUncovered: AuditScopeUnit = {
        ...child,
        coverageStatus: AUDIT_COVERAGE_STATUS.INCOMPLETE,
      };
      const { producerProvenance: _coverageGapProvenance, ...coverageGapFields } = child;
      const requiredCoverageGap: AuditScopeUnit = {
        ...coverageGapFields,
        auditKind: AUDIT_KIND.COVERAGE_GAP,
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus: AUDIT_COVERAGE_STATUS.MISSING_SKILL,
      };
      const mismatchedRoot: AuditScopeUnit = { ...root, subject: relatedSubject };
      return {
        scopeIdentity,
        relatedSubject,
        rootPayload: auditScopePayload(root),
        childPayload: auditScopePayload(child),
        mismatchedRootPayload: auditScopePayload(mismatchedRoot),
        parentedRootPayload: auditScopePayload({ ...root, parentUnitId: orphan }),
        optionalRootPayload: auditScopePayload({
          ...root,
          coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.OPTIONAL,
        }),
        mismatchedRootEvent: auditScopeEvent(mismatchedRoot, JOURNAL_SEQ_BASE),
        orphanChildPayload: auditScopePayload({ ...child, parentUnitId: orphan }),
        rootEvent: auditScopeEvent(root, JOURNAL_SEQ_BASE),
        childEvent: auditScopeEvent(child, JOURNAL_SEQ_BASE + 1),
        requiredNotApplicableEvent: auditScopeEvent(requiredNotApplicable, JOURNAL_SEQ_BASE + 1),
        optionalUncoveredEvent: auditScopeEvent(optionalUncovered, JOURNAL_SEQ_BASE + 1),
        requiredUncoveredEvents: AUDIT_UNCOVERED_COVERAGE_STATUSES.map((coverageStatus, index) =>
          auditScopeEvent(
            { ...child, coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED, coverageStatus },
            JOURNAL_SEQ_BASE + 1 + index,
          )
        ),
        requiredCoverageGapEvent: auditScopeEvent(requiredCoverageGap, JOURNAL_SEQ_BASE + 1),
        findingEvents: AUDIT_FINDING_SEVERITIES.map((severity, index) =>
          auditFindingEvent({ ...finding, unitId: root.unitId, severity }, JOURNAL_SEQ_BASE + 1 + index)
        ),
        duplicateRootEvent: auditScopeEvent(duplicateRoot, JOURNAL_SEQ_BASE + 1),
      };
    });
}
