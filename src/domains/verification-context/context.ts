import { canonicalDescriptorJson, digestDescriptorSection } from "@/config/descriptor-digest";
import type { Result } from "@/config/types";

export const VERIFICATION_CONTEXT_SCHEMA_VERSION = "verification-context.v1";

export const VERIFICATION_CONTEXT_SUBJECT_KIND = {
  FILE: "file",
  CHANGESET: "changeset",
} as const;

export type VerificationContextSubjectKind =
  (typeof VERIFICATION_CONTEXT_SUBJECT_KIND)[keyof typeof VERIFICATION_CONTEXT_SUBJECT_KIND];

export interface VerificationContextFileSubject {
  readonly kind: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.FILE;
  readonly path: string;
}

export interface VerificationContextChangesetSubject {
  readonly kind: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET;
  readonly base: string;
  readonly head: string;
}

export type VerificationContextSubject = VerificationContextFileSubject | VerificationContextChangesetSubject;

export interface VerificationContextWorkflow {
  readonly name: string;
}

export interface VerificationContextLaunch {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly branchIdentity: string;
  readonly headSha: string;
  readonly createdAt: string;
}

export const VERIFICATION_CONTEXT_PERSISTENCE = {
  kind: "state-store",
  scope: "branch",
  domain: "verification-context",
  format: "canonical-json",
} as const;

export const VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS = {
  STATUS: "status",
  VERDICT: "verdict",
  COST: "cost",
  ACTIVITY_TRACE: "activityTrace",
} as const;

export interface VerificationContextPayload {
  readonly schemaVersion: typeof VERIFICATION_CONTEXT_SCHEMA_VERSION;
  readonly subject: VerificationContextSubject;
  readonly predicate: string;
  readonly workflow: VerificationContextWorkflow;
  readonly launch: VerificationContextLaunch;
  readonly persistence: typeof VERIFICATION_CONTEXT_PERSISTENCE;
}

export interface VerificationContextDocument {
  readonly digest: string;
  readonly context: VerificationContextPayload;
}

export interface VerificationContextDocumentResult extends VerificationContextDocument {
  readonly canonicalJson: string;
}

const VERIFICATION_CONTEXT_DIGEST_PATH = "verification context";

export function createVerificationContextDocument(
  payload: VerificationContextPayload,
): Result<VerificationContextDocumentResult> {
  const digest = digestDescriptorSection(payload, VERIFICATION_CONTEXT_DIGEST_PATH);
  if (!digest.ok) return digest;
  const document: VerificationContextDocument = {
    digest: digest.value.sha256,
    context: payload,
  };
  const canonical = canonicalDescriptorJson(document, VERIFICATION_CONTEXT_DIGEST_PATH);
  if (!canonical.ok) return canonical;
  return {
    ok: true,
    value: {
      ...document,
      canonicalJson: canonical.value,
    },
  };
}
