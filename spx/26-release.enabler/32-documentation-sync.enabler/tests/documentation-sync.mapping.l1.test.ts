import { join } from "node:path";

import { DEFAULT_RELEASE_DOCUMENTATION_PATHS } from "@/domains/release/config";
import {
  DOCUMENTATION_SYNC_AUDIT_APPROVED,
  DOCUMENTATION_SYNC_AUDIT_INVALID_VERDICT_MESSAGE,
  DOCUMENTATION_SYNC_AUDIT_REJECTED,
  DOCUMENTATION_SYNC_AUDIT_REJECTION_MESSAGE,
} from "@/domains/release/documentation-sync";
import { arbitraryAuditVerdictCases, AUDIT_VERDICT_OUTCOME } from "@testing/generators/release/audit-verdict";
import {
  arbitraryDocumentationPathAliasCases,
  arbitraryNestedDocumentationSyncScenario,
  DOCUMENTATION_AUDIT_CASE,
  DOCUMENTATION_PATH_MAPPING_CASE,
  DOCUMENTATION_PATH_SEMANTICS,
  documentationPathMappingCases,
  sampleDocumentationAuditInput,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  observeDocumentationAudit,
  observeDocumentationPathAliases,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync path mapping", () => {
  it.each(documentationPathMappingCases())("maps documentation path configuration %#", async (mappingCase) => {
    await expect(
      observeDocumentationPathMappings([mappingCase], async () => DOCUMENTATION_SYNC_AUDIT_APPROVED),
    ).resolves.toSatisfy(
      (observations) => {
        for (const observation of observations) {
          const expected = observation.mappingCase.kind === DOCUMENTATION_PATH_MAPPING_CASE.OMITTED
            ? DEFAULT_RELEASE_DOCUMENTATION_PATHS
            : observation.mappingCase.scenario.paths;
          expect(observation.actual).toEqual(expected);
        }
        return true;
      },
    );
  });

  it.each(DOCUMENTATION_PATH_SEMANTICS)("resolves nested slash-separated paths under $label semantics", (semantics) => {
    expect(
      observeDocumentationPathSemantics(
        sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario()),
        [semantics],
      ),
    ).toSatisfy((observations) => {
      for (const observation of observations) {
        expect(observation.actual).toBe(semantics.join(observation.productDir, observation.sourcePath));
      }
      return true;
    });
  });

  it.each(sampleReleaseTestValue(arbitraryDocumentationPathAliasCases()))(
    "resolves path alias $configuredPath",
    async (aliasCase) => {
      await expect(
        observeDocumentationPathAliases(
          [aliasCase],
        ),
      ).resolves.toSatisfy((observations) => {
        for (const observation of observations) {
          expect(observation.actualDocumentCount).toBe(1);
          expect(observation.actualSourcePath).toBe(observation.aliasCase.configuredPath);
          expect(observation.actualTargetPath).toBe(observation.canonicalTargetPath);
          expect(observation.actualStagedPath).toBe(
            join(observation.stageWorkingDirectory, observation.aliasCase.canonicalPath),
          );
          expect(observation.actualContent).toBe(observation.aliasCase.content);
        }
        return true;
      });
    },
  );

  it.each(sampleReleaseTestValue(
    arbitraryAuditVerdictCases({
      approved: DOCUMENTATION_SYNC_AUDIT_APPROVED,
      rejected: DOCUMENTATION_SYNC_AUDIT_REJECTED,
    }),
  ))(
    "maps documentation sync audit verdict $verdict by its first whitespace-delimited token",
    async (verdictCase) => {
      await expect(
        observeDocumentationAudit(
          sampleDocumentationAuditInput(
            DOCUMENTATION_AUDIT_CASE.REJECT_BEFORE_PROMOTION,
          ),
          async () => verdictCase.verdict,
        ),
      ).resolves.toSatisfy((observation) => {
        if (verdictCase.outcome === AUDIT_VERDICT_OUTCOME.APPROVED) {
          expect(observation.error).toBeUndefined();
          expect(observation.promotionCallCount).toBeGreaterThan(0);
        } else {
          expect(observation.promotionCallCount).toBe(0);
          expect(observation.error).toBeInstanceOf(Error);
          expect(String(observation.error)).toContain(
            verdictCase.outcome === AUDIT_VERDICT_OUTCOME.REJECTED
              ? DOCUMENTATION_SYNC_AUDIT_REJECTION_MESSAGE
              : DOCUMENTATION_SYNC_AUDIT_INVALID_VERDICT_MESSAGE,
          );
        }
        return true;
      });
    },
  );
});
