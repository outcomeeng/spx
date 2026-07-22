import { join } from "node:path";

import { DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE } from "@/domains/release/documentation-sync";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryMultiDocumentSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  arbitraryReleaseVersionVariantOnlyScenario,
  arbitrarySingleDocumentSyncScenario,
  documentationContentEntries,
  documentationPathFailureCases,
  documentationTransformationEntries,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  DOCUMENTATION_AUDIT_CASE,
  DOCUMENTATION_FAILURE_CASE,
  DOCUMENTATION_FIFO_STAGE_OUTCOME,
  DOCUMENTATION_IDENTITY_CASE,
  DOCUMENTATION_PROMOTION_FAILURE_CASE,
  DOCUMENTATION_PROMPT_CASE,
  DOCUMENTATION_ROLLBACK_CASE,
  DOCUMENTATION_VERSION_VALIDATION_CASE,
  observeAtomicDocumentationPromotion,
  observeDocumentationAudit,
  observeDocumentationFailure,
  observeDocumentationFifoRejection,
  observeDocumentationIdentityRejection,
  observeDocumentationPathFailures,
  observeDocumentationPromotionFailure,
  observeDocumentationPrompt,
  observeDocumentationRollback,
  observeDocumentationVersionValidation,
  REJECTING_DOCUMENTATION_AUDIT_MESSAGE,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync compliance", () => {
  it("rejects every generated invalid path before generation or promotion", async () => {
    await expect(observeDocumentationPathFailures(documentationPathFailureCases())).resolves.toSatisfy(
      (observations) => {
        for (const observation of observations) {
          expect(observation.error).toBeDefined();
          expect(observation.agentRequestCount).toBe(0);
          expect(observation.promotionCallCount).toBe(0);
          for (const backingFileContent of observation.backingFileContents) {
            expect(backingFileContent).toBe(observation.failureCase.backingContent);
          }
        }
        return true;
      },
    );
  });

  it("leaves product documentation unpromoted when generation fails", async () => {
    await expect(
      observeDocumentationFailure(
        DOCUMENTATION_FAILURE_CASE.GENERATION,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("leaves product documentation unpromoted when staged read-back fails", async () => {
    await expect(
      observeDocumentationFailure(
        DOCUMENTATION_FAILURE_CASE.READ_BACK,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rejects staged symlinks before audit or promotion", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.STAGED_SYMLINK,
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves
      .toSatisfy(
        (observation) => {
          expect(observation.error).toBeDefined();
          expect(observation.auditRequestCount).toBe(0);
          expect(observation.promotionCallCount).toBe(0);
          expect(observation.actual).toEqual(
            documentationContentEntries(observation.scenario, observation.scenario.original),
          );
          return true;
        },
      );
  });

  it("rejects product documentation identity changes during staging reads", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.PRODUCT_READ,
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves
      .toSatisfy(
        (observation) => {
          expect(observation.error).toBeDefined();
          expect(observation.agentRequestCount).toBe(0);
          expect(observation.atomicWriteCount).toBe(0);
          expect(observation.actual).toEqual(
            documentationContentEntries(observation.scenario, observation.scenario.original),
          );
          return true;
        },
      );
  });

  it("rejects product documentation identity changes during canonical resolution", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.CANONICAL_RESOLUTION,
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.agentRequestCount).toBe(0);
        expect(observation.atomicWriteCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rejects staged documentation identity changes during read-back", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.STAGED_READ,
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.atomicWriteCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rejects configured documentation paths that share one file identity", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.DUPLICATE_FILE,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves
      .toSatisfy(
        (observation) => {
          expect(observation.error).toBeDefined();
          expect(observation.agentRequestCount).toBe(0);
          expect(observation.promotionCallCount).toBe(0);
          expect(observation.actual).toEqual(
            documentationContentEntries(observation.scenario, observation.scenario.original),
          );
          return true;
        },
      );
  });

  it("rejects FIFO documentation paths without blocking on open", async () => {
    await expect(
      observeDocumentationFifoRejection(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.outcome).toBe(DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED);
        expect(observation.agentRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        return true;
      },
    );
  });

  it("validates every released version before invoking the faithfulness audit", async () => {
    await expect(
      observeDocumentationVersionValidation(
        DOCUMENTATION_VERSION_VALIDATION_CASE.COMPLETE_HISTORY,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.auditRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rejects a release-version variant as the only released-version reference", async () => {
    await expect(
      observeDocumentationVersionValidation(
        DOCUMENTATION_VERSION_VALIDATION_CASE.VERSION_VARIANT,
        sampleReleaseTestValue(arbitraryReleaseVersionVariantOnlyScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.auditRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rejects partially updated version references before invoking the faithfulness audit", async () => {
    await expect(
      observeDocumentationVersionValidation(
        DOCUMENTATION_VERSION_VALIDATION_CASE.PARTIAL_REWRITE,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.auditRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("validates the complete configured set before promoting any document", async () => {
    await expect(
      observeDocumentationFailure(
        DOCUMENTATION_FAILURE_CASE.INCOMPLETE_SET,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("restores earlier documents when a later atomic promotion fails", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        DOCUMENTATION_PROMOTION_FAILURE_CASE.SECOND_WRITE,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.atomicFailureCount).toBe(1);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("leaves the complete staged set unpromoted when a document changes after staging", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        DOCUMENTATION_PROMOTION_FAILURE_CASE.POST_STAGING_EDIT,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.atomicWriteCount).toBe(0);
        expect(observation.actual).toEqual(
          observation.scenario.paths.map((path: string) => ({
            path,
            content: path === observation.interveningPath
              ? observation.scenario.intervening[path]
              : observation.scenario.original[path],
          })),
        );
        return true;
      },
    );
  });

  it("rejects a same-content identity replacement after staging", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.STAGED_REPLACEMENT,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.atomicWriteCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("rolls back earlier writes when a later document changes during promotion", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        DOCUMENTATION_PROMOTION_FAILURE_CASE.DURING_PROMOTION_EDIT,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.actual).toEqual(
          observation.scenario.paths.map((path: string) => ({
            path,
            content: path === observation.interveningPath
              ? observation.scenario.intervening[path]
              : observation.scenario.original[path],
          })),
        );
        return true;
      },
    );
  });

  it("rejects a target identity change at the atomic replacement boundary", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        DOCUMENTATION_IDENTITY_CASE.PROMOTION_REPLACEMENT,
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeDefined();
        expect(observation.atomicWriteCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("closes documentation handles before the production atomic replacement", async () => {
    await expect(
      observeAtomicDocumentationPromotion(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeUndefined();
        expect(observation.result).toEqual({ paths: observation.scenario.paths });
        expect(observation.openHandleCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.updated),
        );
        return true;
      },
    );
  });

  it("preserves a post-promotion edit when rollback follows a later failure", async () => {
    await expect(
      observeDocumentationRollback(
        DOCUMENTATION_ROLLBACK_CASE.POST_PROMOTION_EDIT,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(AggregateError);
        expect(observation.failureCount).toBe(1);
        expect(observation.actual).toEqual(
          observation.scenario.paths.map((path: string) => ({
            path,
            content: path === observation.primary.path
              ? observation.primary.interveningContent
              : observation.scenario.original[path],
          })),
        );
        return true;
      },
    );
  });

  it("preserves a same-content identity replacement when rollback follows a later failure", async () => {
    await expect(
      observeDocumentationRollback(
        DOCUMENTATION_ROLLBACK_CASE.IDENTITY_REPLACEMENT,
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      ),
    ).resolves
      .toSatisfy(
        (observation) => {
          expect(observation.error).toBeInstanceOf(AggregateError);
          expect(observation.failureCount).toBe(1);
          expect(observation.actual).toEqual(
            observation.scenario.paths.map((path: string) => ({
              path,
              content: path === observation.primary.path
                ? observation.primary.updatedContent
                : observation.scenario.original[path],
            })),
          );
          return true;
        },
      );
  });

  it("audits the read-back set before promoting any document", async () => {
    await expect(
      observeDocumentationAudit(
        DOCUMENTATION_AUDIT_CASE.REJECT_BEFORE_PROMOTION,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(Error);
        expect((observation.error as Error).message).toBe(REJECTING_DOCUMENTATION_AUDIT_MESSAGE);
        expect(observation.actualReleaseData).toBe(observation.scenario.releaseData);
        expect(observation.actualDocuments).toEqual(observation.scenario.paths);
        expect(observation.promotionCallCount).toBe(0);
        expect(observation.actual).toEqual(
          documentationContentEntries(observation.scenario, observation.scenario.original),
        );
        return true;
      },
    );
  });

  it("audits each original-to-read-back documentation transformation", async () => {
    await expect(
      observeDocumentationAudit(
        DOCUMENTATION_AUDIT_CASE.TRANSFORMATION,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeUndefined();
        expect(observation.actualReleaseData).toBe(observation.scenario.releaseData);
        expect(observation.actualDocuments).toEqual(
          documentationTransformationEntries(observation.scenario),
        );
        return true;
      },
    );
  });

  it("passes only release data and staged document paths to the producing agent", async () => {
    await expect(
      observeDocumentationPrompt(
        DOCUMENTATION_PROMPT_CASE.PRODUCER_INPUT,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.producerRequestCount).toBe(1);
        expect(observation.actualProducerInput).toEqual({
          releaseData: observation.scenario.releaseData,
          documents: observation.scenario.paths.map((sourcePath: string) => ({
            sourcePath,
            stagedPath: join(observation.producerWorkingDirectory, sourcePath),
          })),
        });
        return true;
      },
    );
  });

  it("keeps delimiter-shaped release data inside producer and audit data blocks", async () => {
    await expect(
      observeDocumentationPrompt(
        DOCUMENTATION_PROMPT_CASE.DATA_BOUNDARY,
        sampleReleaseTestValue(arbitraryPromptBoundaryDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.actualProducerInput).toEqual({
          releaseData: observation.scenario.releaseData,
          documents: observation.scenario.paths.map((sourcePath: string) => ({
            sourcePath,
            stagedPath: join(observation.producerWorkingDirectory, sourcePath),
          })),
        });
        expect(observation.producerInstruction).not.toContain(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE);
        expect(observation.producerInstruction).toContain(observation.encodedVersion.slice(1, -1));
        expect(observation.auditRequestCount).toBe(1);
        expect(observation.actualAuditInput).toEqual({
          releaseData: observation.scenario.releaseData,
          documents: documentationTransformationEntries(observation.scenario),
        });
        return true;
      },
    );
  });

  it("excludes ambient spec-tree and domain state from the producing prompt", async () => {
    await expect(
      observeDocumentationPrompt(
        DOCUMENTATION_PROMPT_CASE.AMBIENT_EXCLUSION,
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      ),
    ).resolves.toSatisfy(
      (observation) => {
        expect(observation.producerRequestCount).toBe(1);
        for (const { path, content } of observation.scenario.ambientState) {
          expect(observation.producerPrompt).not.toContain(path);
          expect(observation.producerPrompt).not.toContain(content);
        }
        return true;
      },
    );
  });
});
