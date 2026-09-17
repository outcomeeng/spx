import { join } from "node:path";

import {
  DOCUMENTATION_SYNC_AUDIT_APPROVED,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
} from "@/domains/release/documentation-sync";
import {
  arbitrarySingleDocumentSyncScenario,
  DOCUMENTATION_AUDIT_CASE,
  DOCUMENTATION_FAILURE_CASE,
  DOCUMENTATION_IDENTITY_CASE,
  DOCUMENTATION_PROMOTION_FAILURE_CASE,
  DOCUMENTATION_PROMPT_CASE,
  DOCUMENTATION_ROLLBACK_CASE,
  DOCUMENTATION_VERSION_VALIDATION_CASE,
  documentationContentEntries,
  documentationPathFailureCases,
  documentationTransformationEntries,
  sampleDocumentationAuditInput,
  sampleDocumentationFailureInput,
  sampleDocumentationIdentityInput,
  sampleDocumentationPromotionFailureInput,
  sampleDocumentationPromptInput,
  sampleDocumentationRollbackInput,
  sampleDocumentationVersionValidationInput,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  DOCUMENTATION_FIFO_STAGE_OUTCOME,
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
    await expect(
      observeDocumentationPathFailures(
        documentationPathFailureCases(),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observations) => {
      for (const observation of observations) {
        expect(observation.error).toBeDefined();
        expect(observation.agentRequestCount).toBe(0);
        expect(observation.promotionCallCount).toBe(0);
        for (const backingFileContent of observation.backingFileContents) {
          expect(backingFileContent).toBe(
            observation.failureCase.backingContent,
          );
        }
      }
      return true;
    });
  });

  it("leaves product documentation unpromoted when generation fails", async () => {
    await expect(
      observeDocumentationFailure(
        sampleDocumentationFailureInput(DOCUMENTATION_FAILURE_CASE.GENERATION),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("leaves product documentation unpromoted when staged read-back fails", async () => {
    await expect(
      observeDocumentationFailure(
        sampleDocumentationFailureInput(DOCUMENTATION_FAILURE_CASE.READ_BACK),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects staged symlinks before audit or promotion", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.STAGED_SYMLINK,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.auditRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects product documentation identity changes during staging reads", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.PRODUCT_READ,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.agentRequestCount).toBe(0);
      expect(observation.atomicWriteCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects product documentation identity changes during canonical resolution", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.CANONICAL_RESOLUTION,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.agentRequestCount).toBe(0);
      expect(observation.atomicWriteCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects staged documentation identity changes during read-back", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.STAGED_READ,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.atomicWriteCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects configured documentation paths that share one file identity", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.DUPLICATE_FILE,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.agentRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects FIFO documentation paths without blocking on open", async () => {
    await expect(
      observeDocumentationFifoRejection(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.outcome).toBe(
        DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED,
      );
      expect(observation.agentRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      return true;
    });
  });

  it("validates every released version before invoking the faithfulness audit", async () => {
    await expect(
      observeDocumentationVersionValidation(
        sampleDocumentationVersionValidationInput(
          DOCUMENTATION_VERSION_VALIDATION_CASE.COMPLETE_HISTORY,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.auditRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects a release-version variant as the only released-version reference", async () => {
    await expect(
      observeDocumentationVersionValidation(
        sampleDocumentationVersionValidationInput(
          DOCUMENTATION_VERSION_VALIDATION_CASE.VERSION_VARIANT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.auditRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rejects partially updated version references before invoking the faithfulness audit", async () => {
    await expect(
      observeDocumentationVersionValidation(
        sampleDocumentationVersionValidationInput(
          DOCUMENTATION_VERSION_VALIDATION_CASE.PARTIAL_REWRITE,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.auditRequestCount).toBe(0);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("validates the complete configured set before promoting any document", async () => {
    await expect(
      observeDocumentationFailure(
        sampleDocumentationFailureInput(
          DOCUMENTATION_FAILURE_CASE.INCOMPLETE_SET,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("restores earlier documents when a later atomic promotion fails", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        sampleDocumentationPromotionFailureInput(
          DOCUMENTATION_PROMOTION_FAILURE_CASE.SECOND_WRITE,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.atomicFailureCount).toBe(1);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("leaves the complete staged set unpromoted when a document changes after staging", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        sampleDocumentationPromotionFailureInput(
          DOCUMENTATION_PROMOTION_FAILURE_CASE.POST_STAGING_EDIT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
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
    });
  });

  it("rejects a same-content identity replacement after staging", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.STAGED_REPLACEMENT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.atomicWriteCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("rolls back earlier writes when a later document changes during promotion", async () => {
    await expect(
      observeDocumentationPromotionFailure(
        sampleDocumentationPromotionFailureInput(
          DOCUMENTATION_PROMOTION_FAILURE_CASE.DURING_PROMOTION_EDIT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
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
    });
  });

  it("rejects a target identity change at the atomic replacement boundary", async () => {
    await expect(
      observeDocumentationIdentityRejection(
        sampleDocumentationIdentityInput(
          DOCUMENTATION_IDENTITY_CASE.PROMOTION_REPLACEMENT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeDefined();
      expect(observation.atomicWriteCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("closes documentation handles before the production atomic replacement", async () => {
    await expect(
      observeAtomicDocumentationPromotion(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.result).toEqual({ paths: observation.scenario.paths });
      expect(observation.openHandleCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.updated,
        ),
      );
      return true;
    });
  });

  it("preserves a post-promotion edit when rollback follows a later failure", async () => {
    await expect(
      observeDocumentationRollback(
        sampleDocumentationRollbackInput(
          DOCUMENTATION_ROLLBACK_CASE.POST_PROMOTION_EDIT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
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
    });
  });

  it("preserves a same-content identity replacement when rollback follows a later failure", async () => {
    await expect(
      observeDocumentationRollback(
        sampleDocumentationRollbackInput(
          DOCUMENTATION_ROLLBACK_CASE.IDENTITY_REPLACEMENT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
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
    });
  });

  it("audits the read-back set before promoting any document", async () => {
    await expect(
      observeDocumentationAudit(
        sampleDocumentationAuditInput(
          DOCUMENTATION_AUDIT_CASE.REJECT_BEFORE_PROMOTION,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(Error);
      expect((observation.error as Error).message).toBe(
        REJECTING_DOCUMENTATION_AUDIT_MESSAGE,
      );
      expect(observation.actualReleaseData).toBe(
        observation.scenario.releaseData,
      );
      expect(observation.actualDocuments).toEqual(observation.scenario.paths);
      expect(observation.promotionCallCount).toBe(0);
      expect(observation.actual).toEqual(
        documentationContentEntries(
          observation.scenario,
          observation.scenario.original,
        ),
      );
      return true;
    });
  });

  it("audits each original-to-read-back documentation transformation", async () => {
    await expect(
      observeDocumentationAudit(
        sampleDocumentationAuditInput(DOCUMENTATION_AUDIT_CASE.TRANSFORMATION),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.actualReleaseData).toBe(
        observation.scenario.releaseData,
      );
      expect(observation.actualDocuments).toEqual(
        documentationTransformationEntries(observation.scenario),
      );
      return true;
    });
  });

  it("passes release source inputs and staged document paths to the producing agent", async () => {
    await expect(
      observeDocumentationPrompt(
        sampleDocumentationPromptInput(
          DOCUMENTATION_PROMPT_CASE.PRODUCER_INPUT,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.producerRequestCount).toBe(1);
      expect(observation.actualProducerInput).toEqual({
        productContext: [],
        releaseData: observation.scenario.releaseData,
        documents: observation.scenario.paths.map((sourcePath: string) => ({
          sourcePath,
          stagedPath: join(observation.producerWorkingDirectory, sourcePath),
        })),
      });
      return true;
    });
  });

  it("keeps delimiter-shaped release data inside producer and audit data blocks", async () => {
    await expect(
      observeDocumentationPrompt(
        sampleDocumentationPromptInput(DOCUMENTATION_PROMPT_CASE.DATA_BOUNDARY),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.actualProducerInput).toEqual({
        productContext: [],
        releaseData: observation.scenario.releaseData,
        documents: observation.scenario.paths.map((sourcePath: string) => ({
          sourcePath,
          stagedPath: join(observation.producerWorkingDirectory, sourcePath),
        })),
      });
      expect(observation.producerInstruction).not.toContain(
        DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
      );
      expect(observation.producerInstruction).toContain(
        observation.encodedVersion.slice(1, -1),
      );
      expect(observation.auditRequestCount).toBe(1);
      expect(observation.actualAuditInput).toEqual({
        productContext: [],
        releaseData: observation.scenario.releaseData,
        documents: documentationTransformationEntries(observation.scenario),
      });
      return true;
    });
  });

  it("excludes files outside the selected product context from the producing prompt", async () => {
    await expect(
      observeDocumentationPrompt(
        sampleDocumentationPromptInput(
          DOCUMENTATION_PROMPT_CASE.AMBIENT_EXCLUSION,
        ),
        async () => DOCUMENTATION_SYNC_AUDIT_APPROVED,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.producerRequestCount).toBe(1);
      for (const { path, content } of observation.scenario.ambientState) {
        expect(observation.producerPrompt).not.toContain(path);
        expect(observation.producerPrompt).not.toContain(content);
      }
      return true;
    });
  });
});
