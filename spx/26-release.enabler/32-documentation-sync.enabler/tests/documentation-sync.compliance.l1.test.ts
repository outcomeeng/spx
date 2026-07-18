import {
  type AgentRunner,
  approvingDocumentationAuditor,
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryMultiDocumentSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  arbitraryReleaseVersionVariantOnlyScenario,
  arbitrarySingleDocumentSyncScenario,
  composeDocumentationSync,
  composeWithDocumentationFilesystem,
  createDocumentationAtomicWriter,
  createDocumentationFaithfulnessAuditor,
  createDocumentationSyncFilesystem,
  delay,
  DOCUMENTATION_FIFO_BLOCK_DETECTION_MS,
  DOCUMENTATION_FIFO_COMMAND,
  DOCUMENTATION_FIFO_STAGE_OUTCOME,
  DOCUMENTATION_PATH_FAILURE_KIND,
  DOCUMENTATION_READ_RACE_TARGET,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_TEXT_ENCODING,
  type DocumentationFailureControls,
  type DocumentationPathFailureCase,
  documentationPathFailureCases,
  type DocumentationReadRaceTarget,
  documentationSyncPromptInstruction,
  type DocumentationSyncScenario,
  DocumentationWritingAgent,
  encodeReleasePromptData,
  execa,
  EXTERNAL_DIRECTORY_PREFIX,
  FailingDocumentationAgent,
  failingDocumentationReader,
  FailingSecondDocumentationAtomicWriter,
  FirstDocumentationWritingAgent,
  IdentityReplacingDocumentationAtomicWriter,
  InterveningDocumentationEditPromoter,
  InterveningDocumentationIdentityPromoter,
  InterveningDuringPromotionAtomicWriter,
  isPathContained,
  join,
  lastDocumentationPath,
  link,
  materializeDocumentationPathFailure,
  parseDocumentationPromptDataBlock,
  parseDocumentationSyncPromptInput,
  PartiallyUpdatingDocumentationAgent,
  PassiveDocumentationAgent,
  PostPromotionEditFailingAtomicWriter,
  PostRenameIdentityReplacingAtomicFileSystem,
  primaryDocumentation,
  PRODUCT_DIRECTORY_PREFIX,
  type ProductDocumentationReader,
  readFile,
  realpath,
  RecordingDocumentationAtomicWriter,
  RecordingDocumentationAuditor,
  RecordingDocumentationPromoter,
  REJECTING_DOCUMENTATION_AUDIT_MESSAGE,
  rejectingDocumentationAuditor,
  rename,
  RetargetingDocumentationCanonicalPathResolver,
  RetargetingDocumentationFileOpener,
  rm,
  sampleReleaseTestValue,
  StagedSymlinkReplacingAgent,
  TrackingDocumentationFileOpener,
  withDocumentationScenario,
  withTempDir,
  writeFile,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

async function expectProductDocumentationUnchanged(
  scenario: DocumentationSyncScenario,
  readProductDocument: ProductDocumentationReader,
): Promise<void> {
  for (const path of scenario.paths) {
    await expect(readProductDocument(path)).resolves.toBe(scenario.original[path]);
  }
}

async function expectOnlyInterveningDocumentationEdit(
  scenario: DocumentationSyncScenario,
  interveningPath: string,
  readProductDocument: ProductDocumentationReader,
): Promise<void> {
  for (const path of scenario.paths) {
    await expect(readProductDocument(path)).resolves.toBe(
      path === interveningPath ? scenario.intervening[path] : scenario.original[path],
    );
  }
}

async function assertDocumentationFailureLeavesProductUnchanged(
  scenario: DocumentationSyncScenario,
  controls: DocumentationFailureControls,
): Promise<void> {
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeDocumentationSync({
      ...options,
      ...controls,
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertDuplicateDocumentationIdentityRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primaryPath = scenario.paths.at(0);
  const aliasPath = scenario.paths.at(1);
  if (primaryPath === undefined || aliasPath === undefined) {
    throw new Error("Generated documentation identity case requires two paths");
  }
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
    await rm(join(options.productDir, aliasPath));
    await link(
      join(options.productDir, primaryPath),
      join(options.productDir, aliasPath),
    );
    await expect(composeDocumentationSync({
      ...options,
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(agent.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertFifoRejectedWithoutBlocking(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
    const fifoPath = join(options.productDir, primary.path);
    await rm(fifoPath);
    await execa(DOCUMENTATION_FIFO_COMMAND, [fifoPath]);
    const sync = composeDocumentationSync({
      ...options,
      promoteDocumentation: promoter.promote,
    });
    const outcome = await Promise.race([
      sync.then(
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.RESOLVED,
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED,
      ),
      delay(DOCUMENTATION_FIFO_BLOCK_DETECTION_MS).then(
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED,
      ),
    ]);
    if (outcome === DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED) {
      await Promise.allSettled([
        sync,
        writeFile(fifoPath, primary.originalContent),
      ]);
    }
    expect(outcome).toBe(DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED);
    expect(agent.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
  });
}

async function assertVersionValidationPrecedesFaithfulnessAudit(
  scenario: DocumentationSyncScenario,
  agentRunner: AgentRunner,
): Promise<void> {
  const auditor = new RecordingDocumentationAuditor();
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeDocumentationSync({
      ...options,
      agentRunner,
      faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(auditor.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertStagedSymlinkRejectedBeforeAuditAndPromotion(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const sourcePath = primaryDocumentation(scenario).path;
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    const auditor = new RecordingDocumentationAuditor();
    const promoter = new RecordingDocumentationPromoter();
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      await expect(composeDocumentationSync({
        ...options,
        agentRunner: new StagedSymlinkReplacingAgent(
          scenario.updated,
          sourcePath,
          join(externalDir, sourcePath),
        ),
        faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow();
      expect(auditor.requests).toHaveLength(0);
      expect(promoter.calls).toHaveLength(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertProductStagingIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  await assertDocumentationReadIdentityChangeRejected(
    scenario,
    DOCUMENTATION_READ_RACE_TARGET.PRODUCT,
  );
}

async function assertStagedReadbackIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  await assertDocumentationReadIdentityChangeRejected(
    scenario,
    DOCUMENTATION_READ_RACE_TARGET.STAGED,
  );
}

async function assertCanonicalResolutionIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
      const canonicalProductDir = await realpath(options.productDir);
      const resolver = new RetargetingDocumentationCanonicalPathResolver(
        join(canonicalProductDir, primary.path),
        join(externalDir, primary.path),
        primary.originalContent,
      );
      const writer = new RecordingDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({
        resolveCanonicalDocumentationPath: resolver.resolve,
        writeDocumentAtomic: writer.write,
      });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      expect(agent.requests).toHaveLength(0);
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertDocumentationReadIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
  target: DocumentationReadRaceTarget,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
      const canonicalProductDir = await realpath(options.productDir);
      const opener = new RetargetingDocumentationFileOpener(
        target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT
          ? (path) => path === join(canonicalProductDir, primary.path)
          : (path) => !isPathContained(canonicalProductDir, path),
        join(externalDir, primary.path),
        target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT
          ? primary.originalContent
          : primary.updatedContent,
      );
      const writer = new RecordingDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({
        openDocumentationFile: opener.open,
        writeDocumentAtomic: writer.write,
      });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      if (target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT) expect(agent.requests).toHaveLength(0);
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertPromotionIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const canonicalProductDir = await realpath(options.productDir);
      const writer = new IdentityReplacingDocumentationAtomicWriter(
        join(canonicalProductDir, primary.path),
        join(externalDir, primary.path),
        primary.originalContent,
      );
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertStagedIdentityReplacementRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const writer = new RecordingDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      const promoter = new InterveningDocumentationIdentityPromoter(
        join(options.productDir, primary.path),
        join(externalDir, primary.path),
        primary.originalContent,
        filesystem.promoteDocumentation,
      );
      await expect(composeDocumentationSync({
        ...options,
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow();
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertAtomicPromotionClosesDocumentationHandles(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const opener = new TrackingDocumentationFileOpener();
  const writer = createDocumentationAtomicWriter({
    writeFile: async (path, content) => await writeFile(path, content),
    rename: async (from, to) => {
      if (opener.openHandleCount > 0) {
        throw new Error("Atomic rename attempted with an open documentation handle");
      }
      await rename(from, to);
    },
    rm: async (path, options) => await rm(path, options),
  });
  const filesystem = createDocumentationSyncFilesystem({
    openDocumentationFile: opener.open,
    writeDocumentAtomic: writer,
  });
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeWithDocumentationFilesystem(options, filesystem)).resolves.toEqual({
      paths: scenario.paths,
    });
    expect(opener.openHandleCount).toBe(0);
    for (const path of scenario.paths) {
      await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
    }
  });
}

async function assertRollbackPreservesPostPromotionEdit(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    const writer = new PostPromotionEditFailingAtomicWriter(
      join(options.productDir, primary.path),
      primary.interveningContent,
    );
    const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
    await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toBeInstanceOf(AggregateError);
    expect(writer.failures).toBe(1);
    await expectOnlyInterveningDocumentationEdit(scenario, primary.path, readProductDocument);
  });
}

async function assertRollbackPreservesPostPromotionIdentityReplacement(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const fileSystem = new PostRenameIdentityReplacingAtomicFileSystem(
        join(externalDir, primary.path),
        primary.updatedContent,
      );
      const filesystem = createDocumentationSyncFilesystem({
        writeDocumentAtomic: createDocumentationAtomicWriter(fileSystem),
      });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toBeInstanceOf(AggregateError);
      expect(fileSystem.failures).toBe(1);
      for (const path of scenario.paths) {
        await expect(readProductDocument(path)).resolves.toBe(
          path === primary.path ? primary.updatedContent : scenario.original[path],
        );
      }
    });
  });
}

async function assertDocumentationPathFailure(
  failureCase: DocumentationPathFailureCase,
): Promise<void> {
  await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
    await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
      await materializeDocumentationPathFailure(failureCase, productDir, externalDir);
      const filesystem = createDocumentationSyncFilesystem();
      const agent = new PassiveDocumentationAgent();
      const promoter = new RecordingDocumentationPromoter();
      await expect(composeDocumentationSync({
        releaseData: failureCase.releaseData,
        config: failureCase.config,
        productDir,
        agentRunner: agent,
        stageDocumentation: filesystem.stageDocumentation,
        readDocument: filesystem.readDocument,
        promoteDocumentation: promoter.promote,
        faithfulnessAuditor: approvingDocumentationAuditor,
      })).rejects.toThrow();
      expect(agent.requests).toHaveLength(0);
      expect(promoter.calls).toHaveLength(0);
      await expectDocumentationPathBackingUnchanged(failureCase, productDir, externalDir);
    });
  });
}

async function expectDocumentationPathBackingUnchanged(
  failureCase: DocumentationPathFailureCase,
  productDir: string,
  externalDir: string,
): Promise<void> {
  if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE) {
    await expect(readFile(join(externalDir, failureCase.backingPath), DOCUMENTATION_TEXT_ENCODING)).resolves.toBe(
      failureCase.backingContent,
    );
  }
  if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK) {
    await expect(readFile(join(productDir, failureCase.backingPath), DOCUMENTATION_TEXT_ENCODING)).resolves.toBe(
      failureCase.backingContent,
    );
  }
}

describe("documentation sync compliance", () => {
  it.each(documentationPathFailureCases())(
    "rejects $label before generation or promotion",
    async (failureCase) => await assertDocumentationPathFailure(failureCase),
  );

  it("leaves product documentation unpromoted when generation fails", async () => {
    await assertDocumentationFailureLeavesProductUnchanged(
      sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      { agentRunner: new FailingDocumentationAgent() },
    );
  });

  it("leaves product documentation unpromoted when staged read-back fails", async () => {
    await assertDocumentationFailureLeavesProductUnchanged(
      sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      { readDocument: failingDocumentationReader },
    );
  });

  it("rejects staged symlinks before audit or promotion", async () => {
    await assertStagedSymlinkRejectedBeforeAuditAndPromotion(
      sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
    );
  });

  it("rejects product documentation identity changes during staging reads", async () => {
    await assertProductStagingIdentityChangeRejected(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("rejects product documentation identity changes during canonical resolution", async () => {
    await assertCanonicalResolutionIdentityChangeRejected(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("rejects staged documentation identity changes during read-back", async () => {
    await assertStagedReadbackIdentityChangeRejected(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("rejects configured documentation paths that share one file identity", async () => {
    await assertDuplicateDocumentationIdentityRejected(
      sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
    );
  });

  it("rejects FIFO documentation paths without blocking on open", async () => {
    await assertFifoRejectedWithoutBlocking(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("validates every released version before invoking the faithfulness audit", async () => {
    await assertVersionValidationPrecedesFaithfulnessAudit(
      sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      new PassiveDocumentationAgent(),
    );
  });

  it("rejects a release-version variant as the only released-version reference", async () => {
    const scenario = sampleReleaseTestValue(arbitraryReleaseVersionVariantOnlyScenario());
    await assertVersionValidationPrecedesFaithfulnessAudit(
      scenario,
      new DocumentationWritingAgent(scenario.updated),
    );
  });

  it("rejects partially updated version references before invoking the faithfulness audit", async () => {
    await assertVersionValidationPrecedesFaithfulnessAudit(
      sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      new PartiallyUpdatingDocumentationAgent(),
    );
  });

  it("validates the complete configured set before promoting any document", async () => {
    const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
    await assertDocumentationFailureLeavesProductUnchanged(scenario, {
      agentRunner: new FirstDocumentationWritingAgent(scenario.updated),
    });
  });

  it("restores earlier documents when a later atomic promotion fails", async () => {
    const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
    const writer = new FailingSecondDocumentationAtomicWriter();
    const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      await expect(composeDocumentationSync({
        ...options,
        promoteDocumentation: filesystem.promoteDocumentation,
      })).rejects.toThrow();
      expect(writer.failures).toBe(1);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });

  it("leaves the complete staged set unpromoted when a document changes after staging", async () => {
    const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
    const interveningPath = lastDocumentationPath(scenario);
    const interveningContent = scenario.intervening[interveningPath];
    if (interveningContent === undefined) throw new Error(`No intervening documentation for ${interveningPath}`);
    const writer = new RecordingDocumentationAtomicWriter();
    const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const promoter = new InterveningDocumentationEditPromoter(
        options.productDir,
        interveningPath,
        interveningContent,
        filesystem.promoteDocumentation,
      );
      await expect(composeDocumentationSync({
        ...options,
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow();
      expect(writer.writes).toBe(0);
      await expectOnlyInterveningDocumentationEdit(scenario, interveningPath, readProductDocument);
    });
  });

  it("rejects a same-content identity replacement after staging", async () => {
    await assertStagedIdentityReplacementRejected(
      sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
    );
  });

  it("rolls back earlier writes when a later document changes during promotion", async () => {
    const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
    const interveningPath = scenario.paths[1];
    const interveningContent = scenario.intervening[interveningPath];
    if (interveningContent === undefined) throw new Error(`No intervening documentation for ${interveningPath}`);
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const writer = new InterveningDuringPromotionAtomicWriter(
        join(options.productDir, interveningPath),
        interveningContent,
      );
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      await expect(composeDocumentationSync({
        ...options,
        promoteDocumentation: filesystem.promoteDocumentation,
      })).rejects.toThrow();
      await expectOnlyInterveningDocumentationEdit(scenario, interveningPath, readProductDocument);
    });
  });

  it("rejects a target identity change at the atomic replacement boundary", async () => {
    await assertPromotionIdentityChangeRejected(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("closes documentation handles before the production atomic replacement", async () => {
    await assertAtomicPromotionClosesDocumentationHandles(
      sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
    );
  });

  it("preserves a post-promotion edit when rollback follows a later failure", async () => {
    await assertRollbackPreservesPostPromotionEdit(
      sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
    );
  });

  it("preserves a same-content identity replacement when rollback follows a later failure", async () => {
    await assertRollbackPreservesPostPromotionIdentityReplacement(
      sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
    );
  });

  it("audits the read-back set before promoting any document", async () => {
    const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
    const promoter = new RecordingDocumentationPromoter();
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      await expect(composeDocumentationSync({
        ...options,
        faithfulnessAuditor: async ({ releaseData, documents }) => {
          expect(releaseData).toBe(scenario.releaseData);
          expect(documents.map(({ path }) => path)).toEqual(scenario.paths);
          await rejectingDocumentationAuditor({ releaseData, documents });
        },
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow(REJECTING_DOCUMENTATION_AUDIT_MESSAGE);
      expect(promoter.calls).toHaveLength(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });

  it("audits each original-to-read-back documentation transformation", async () => {
    const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
    await withDocumentationScenario(scenario, async (options) => {
      await composeDocumentationSync({
        ...options,
        faithfulnessAuditor: async ({ releaseData, documents }) => {
          expect(releaseData).toBe(scenario.releaseData);
          expect(documents).toEqual(scenario.paths.map((path) => ({
            path,
            originalContent: scenario.original[path],
            updatedContent: scenario.updated[path],
          })));
        },
      });
    });
  });

  it("passes only release data and staged document paths to the producing agent", async () => {
    const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
    await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
      await composeDocumentationSync(options);
      expect(agent.requests).toHaveLength(1);
      expect(parseDocumentationSyncPromptInput(agent.requests[0].prompt)).toEqual({
        releaseData: scenario.releaseData,
        documents: scenario.paths.map((sourcePath) => ({
          sourcePath,
          stagedPath: join(agent.requests[0].workingDirectory, sourcePath),
        })),
      });
    });
  });

  it("keeps delimiter-shaped release data inside producer and audit data blocks", async () => {
    const scenario = sampleReleaseTestValue(arbitraryPromptBoundaryDocumentationSyncScenario());
    const auditor = new RecordingDocumentationAuditor();
    await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
      await composeDocumentationSync({
        ...options,
        faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
      });
      expect(parseDocumentationPromptDataBlock(agent.requests[0].prompt)).toEqual({
        releaseData: scenario.releaseData,
        documents: scenario.paths.map((sourcePath) => ({
          sourcePath,
          stagedPath: join(agent.requests[0].workingDirectory, sourcePath),
        })),
      });
      expect(documentationSyncPromptInstruction(agent.requests[0].prompt)).not.toContain(
        DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
      );
      expect(documentationSyncPromptInstruction(agent.requests[0].prompt)).toContain(
        encodeReleasePromptData(scenario.releaseData.version).slice(1, -1),
      );
      expect(auditor.requests).toHaveLength(1);
      expect(parseDocumentationPromptDataBlock(auditor.requests[0].prompt)).toEqual({
        releaseData: scenario.releaseData,
        documents: scenario.paths.map((path) => ({
          path,
          originalContent: scenario.original[path],
          updatedContent: scenario.updated[path],
        })),
      });
    });
  });

  it("excludes ambient spec-tree and domain state from the producing prompt", async () => {
    const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
    await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
      await composeDocumentationSync(options);
      expect(agent.requests).toHaveLength(1);
      for (const { path, content } of scenario.ambientState) {
        expect(agent.requests[0].prompt).not.toContain(path);
        expect(agent.requests[0].prompt).not.toContain(content);
      }
    });
  });
});
