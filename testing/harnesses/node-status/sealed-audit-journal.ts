/**
 * Harness that records sealed `audit` run journals the way a verification run records them, so the production
 * status resolvers read a journal rather than a double of one.
 *
 * @module testing/harnesses/node-status/sealed-audit-journal
 */
import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { JOURNAL_RUN_STATE_STATUS, type JournalRunStateStatus } from "@/domains/journal/run-state";
import { ASSERTION_AUDIT_UNIT } from "@/domains/verify/audit-claim-entry";
import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_STATUS,
  AUDIT_KIND,
  type AuditScopeUnit,
  buildAppendEvent,
  buildRunContextEvent,
  buildTerminalEvent,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_SCOPE_PAYLOAD_FIELD,
  VERIFY_VERIFICATION_TYPE,
  VERIFY_VERIFIER_KIND,
  type VerifyVerifier,
} from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { resolveVerificationBranchSlug } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { arbitraryAuditFinding, arbitraryAuditScopeUnit } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";

/** What a sealed `audit` run journal records: the commit it judged, one tests-audit unit over a subject, and the files it read. */
export interface AuditJournalRecord {
  readonly headCommit: string;
  /** The product-relative path the audit unit judges. */
  readonly subject: string;
  /** The product-relative files the Verifier read. */
  readonly judgedPaths: readonly string[];
  readonly at: Date;
}

/** The identity a recorded audit run carries into the claim. */
export interface RecordedAuditRun {
  readonly run: string;
  readonly verifier: VerifyVerifier;
}

/** A Verifier drawn from the state-store scope-token domain. */
export function sampleAuditVerifier(): VerifyVerifier {
  return { kind: VERIFY_VERIFIER_KIND.AGENT, id: sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()) };
}

/** A tests-audit scope unit over `subject`, the other fields drawn from the audit generator. */
function testsAuditUnitOver(subject: string): AuditScopeUnit {
  const { parentUnitId: _parentUnitId, ...drawn } = sampleVerifyTestValue(arbitraryAuditScopeUnit());
  return { ...drawn, subject, auditKind: AUDIT_KIND.TESTS, coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED };
}

/** Record `journal` as one approved, sealed `audit` run in the store of `productDir`. */
export async function recordSealedAuditJournal(
  productDir: string,
  journal: AuditJournalRecord,
): Promise<RecordedAuditRun> {
  const branchSlug = await resolveVerificationBranchSlug({ cwd: productDir, isGitRepo: true });
  const opened = await openJournalRun(
    { productDir, branchSlug, type: VERIFY_VERIFICATION_TYPE.AUDIT },
    { now: () => journal.at },
  );
  if (!opened.ok) throw new Error(opened.error);
  const { ref } = opened.value;
  const verifier = sampleAuditVerifier();
  const unit = testsAuditUnitOver(journal.subject);
  const payload = {
    ...JSON.parse(JSON.stringify(unit)) as { readonly [key: string]: JsonValue },
    [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [...journal.judgedPaths],
  };
  const terminalStatus: JournalRunStateStatus = JOURNAL_RUN_STATE_STATUS.APPROVED;
  const events = [
    buildRunContextEvent({
      runToken: ref.runToken,
      driveMode: VERIFY_DRIVE_MODE.SPX,
      headCommit: journal.headCommit,
      verifier,
      at: journal.at,
    }),
    buildAppendEvent({
      eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
      idempotencyKey: unit.unitId,
      payload,
      at: journal.at,
    }),
    buildTerminalEvent({ runToken: ref.runToken, terminalStatus, at: journal.at }),
  ];
  const sink = new RecordingJournalStreamSink();
  for (const event of events) {
    const appended = await appendJournalEvent(ref, event, sink);
    if (!appended.ok) throw new Error(appended.error);
  }
  const sealed = await sealJournalRun(ref);
  if (!sealed.ok) throw new Error(sealed.error);
  return { run: ref.runToken, verifier };
}

/** One Assertion audit unit a recorded run judges: the Audit row, its spec, the paths it read, and whether a blocking finding sits on it. */
export interface AssertionAuditUnitRecord {
  readonly slug: string;
  readonly specPath: string;
  readonly judgedPaths: readonly string[];
  readonly blocking: boolean;
}

/** What a sealed Assertion audit run journal records: the commit it judged, its terminal status, and its units. */
export interface AssertionAuditJournalRecord {
  readonly headCommit: string;
  readonly terminalStatus: JournalRunStateStatus;
  readonly units: readonly AssertionAuditUnitRecord[];
  readonly at: Date;
}

/** An Assertion audit scope unit over the row `slug` of `specPath`, the other fields drawn from the audit generator. */
function assertionAuditUnitOver(slug: string, specPath: string): AuditScopeUnit {
  const { parentUnitId: _parentUnitId, ...drawn } = sampleVerifyTestValue(arbitraryAuditScopeUnit());
  return {
    ...drawn,
    unitId: `${ASSERTION_AUDIT_UNIT.PREFIX}${slug}${ASSERTION_AUDIT_UNIT.SEPARATOR}${specPath}`,
    subject: specPath,
    auditClass: AUDIT_CLASS.SPEC,
    auditKind: AUDIT_KIND.SPEC,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
}

/** Record `journal` as one sealed Assertion audit run in the store of `productDir`, one scope event per unit. */
export async function recordSealedAssertionAuditJournal(
  productDir: string,
  journal: AssertionAuditJournalRecord,
): Promise<RecordedAuditRun> {
  const branchSlug = await resolveVerificationBranchSlug({ cwd: productDir, isGitRepo: true });
  const opened = await openJournalRun(
    { productDir, branchSlug, type: VERIFY_VERIFICATION_TYPE.AUDIT },
    { now: () => journal.at },
  );
  if (!opened.ok) throw new Error(opened.error);
  const { ref } = opened.value;
  const verifier = sampleAuditVerifier();
  const events = [
    buildRunContextEvent({
      runToken: ref.runToken,
      driveMode: VERIFY_DRIVE_MODE.SPX,
      headCommit: journal.headCommit,
      verifier,
      at: journal.at,
    }),
  ];
  for (const record of journal.units) {
    const unit = assertionAuditUnitOver(record.slug, record.specPath);
    const payload = {
      ...JSON.parse(JSON.stringify(unit)) as { readonly [key: string]: JsonValue },
      ...(record.judgedPaths.length === 0
        ? {}
        : { [VERIFY_SCOPE_PAYLOAD_FIELD.JUDGED_PATHS]: [...record.judgedPaths] }),
    };
    events.push(buildAppendEvent({
      eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
      idempotencyKey: unit.unitId,
      payload,
      at: journal.at,
    }));
    if (record.blocking) {
      const finding = {
        ...sampleVerifyTestValue(arbitraryAuditFinding()),
        unitId: unit.unitId,
        severity: VERIFY_FINDING_DISPOSITION.BLOCKING,
      };
      events.push(buildAppendEvent({
        eventType: VERIFY_APPEND_EVENT_TYPE.FINDING,
        idempotencyKey: `${unit.unitId}${ASSERTION_AUDIT_UNIT.SEPARATOR}${VERIFY_FINDING_DISPOSITION.BLOCKING}`,
        payload: JSON.parse(JSON.stringify(finding)) as JsonValue,
        at: journal.at,
      }));
    }
  }
  events.push(buildTerminalEvent({ runToken: ref.runToken, terminalStatus: journal.terminalStatus, at: journal.at }));
  const sink = new RecordingJournalStreamSink();
  for (const event of events) {
    const appended = await appendJournalEvent(ref, event, sink);
    if (!appended.ok) throw new Error(appended.error);
  }
  const sealed = await sealJournalRun(ref);
  if (!sealed.ok) throw new Error(sealed.error);
  return { run: ref.runToken, verifier };
}
