import {
  buildReleaseNotesPrompt,
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  changelogVersionHeading,
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  DEFAULT_CHANGELOG_PATH,
  RELEASE_NOTES_USER_FACING_INSTRUCTION,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
  ReleaseNotesError,
} from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { sampleReleaseNotesCompositionFixture } from "@testing/harnesses/release/release-notes";
import {
  observeAbsoluteInTreeReleaseNotesPath,
  observeConfiguredReleaseNotesPathRejection,
  observeExistingReleaseNotesSection,
  observeReleaseNotesFaithfulness,
  observeReleaseNotesMutation,
  observeReleaseNotesPartialWriteFailure,
  observeReleaseNotesPath,
  observeReleaseNotesPathContainment,
  observeReleaseNotesPrompt,
  observeReleaseNotesSymlinkToRootPath,
  RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE,
  RELEASE_NOTES_EXISTING_SECTION_CASE,
  RELEASE_NOTES_FAITHFULNESS_CASE,
  RELEASE_NOTES_MUTATION_CASE,
  RELEASE_NOTES_PATH_CASE,
  RELEASE_NOTES_PROMPT_CASE,
} from "@testing/harnesses/release/release-notes-compliance";
import { describe, expect, it } from "vitest";

it("instructs the producer to describe user-visible release behavior", () => {
  expect(
    buildReleaseNotesPrompt(
      sampleReleaseNotesCompositionFixture().releaseData,
      DEFAULT_CHANGELOG_PATH,
    ),
  ).toContain(RELEASE_NOTES_USER_FACING_INSTRUCTION);
});

describe("composeReleaseNotes builds the prompt from the release data and resolved configuration", () => {
  it("includes the release version, the commit subjects, and the checked canonical staged path as prompt data", async () => {
    await expect(
      observeReleaseNotesPrompt(RELEASE_NOTES_PROMPT_CASE.STANDARD_DATA),
    ).resolves.toSatisfy((observation) => {
      expect(observation.versionDataBlock.start).toBeGreaterThan(-1);
      expect(observation.versionDataBlock.end).toBeGreaterThan(
        observation.versionDataBlock.start,
      );
      expect(JSON.parse(observation.versionDataBlock.data)).toBe(
        observation.releaseData.version,
      );
      expect(observation.subjectsDataBlock.start).toBeGreaterThan(-1);
      expect(observation.subjectsDataBlock.end).toBeGreaterThan(
        observation.subjectsDataBlock.start,
      );
      expect(JSON.parse(observation.subjectsDataBlock.data)).toEqual(
        observation.subjects,
      );
      expect(observation.stagedPromptPath).not.toBe(
        observation.expectedCanonicalPath,
      );
      expect(observation.checkedStagedPromptPath).toBe(
        observation.stagedPromptPath,
      );
      expect(observation.requestWorkingDirectoryCanonicalDuring).toBe(
        observation.request.workingDirectory,
      );
      expect(
        isPathContained(
          observation.request.workingDirectory,
          observation.stagedPromptPath,
        ),
      ).toBe(true);
      expect(observation.request.tools).toEqual(observation.expectedTools);
      expect(observation.request.allowedTools).toEqual(
        observation.expectedTools,
      );
      expect(observation.request.permissionMode).toBe(
        observation.expectedPermissionMode,
      );
      expect(observation.request.maxTurns).toBe(observation.expectedMaxTurns);
      expect(observation.requestWorkingDirectoryCanonicalAfter).toBeUndefined();
      expect(observation.prompt).not.toContain(
        `version ${observation.releaseData.version}`,
      );
      expect(observation.prompt).not.toContain(
        `at ${observation.resolvedPath}`,
      );
      return true;
    });
  });

  it("instructs the agent to preserve existing changelog sections", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.stagedPromptPath).not.toBe(
        observation.expectedCanonicalPath,
      );
      expect(
        isPathContained(
          observation.promptWorkingDirectory,
          observation.stagedPromptPath,
        ),
      ).toBe(true);
      expect(observation.prompt).toContain(observation.preservationInstruction);
      return true;
    });
  });

  it("rejects generated notes that delete an existing version section", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.stagedCanonicalPath).toBe(
        observation.stagedPromptPath,
      );
      expect(observation.stagedInput).toBe(observation.expectedFinalContent);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that copy an existing version section into a code fence", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("accepts generated notes that preserve existing sections while updating footer references", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.result).toEqual(observation.expectedResult);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that truncate an existing fenced reference-definition section", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that truncate an existing section after an in-section reference definition", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("accepts generated notes that preserve an existing section after an in-section reference definition", async () => {
    await expect(
      observeExistingReleaseNotesSection(
        RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.result).toEqual(observation.expectedResult);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("uses a checked canonical staged path in the prompt when a symlink ancestor is followed by parent traversal", async () => {
    await expect(
      observeReleaseNotesPrompt(
        RELEASE_NOTES_PROMPT_CASE.CANONICAL_PARENT_TRAVERSAL,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.stagedPromptPath).not.toBe(
        observation.expectedCanonicalPath,
      );
      expect(
        isPathContained(
          observation.request.workingDirectory,
          observation.stagedPromptPath,
        ),
      ).toBe(true);
      expect(observation.expectedCanonicalPath).not.toBe(
        observation.lexicalResolvedPath,
      );
      expect(observation.finalContent).toBe(observation.expectedContent);
      return true;
    });
  });

  it("keeps delimiter-like release version text inside the encoded data block", async () => {
    await expect(
      observeReleaseNotesPrompt(RELEASE_NOTES_PROMPT_CASE.DELIMITER_VERSION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.versionDataBlock.start).toBeGreaterThan(-1);
      expect(observation.versionDataBlock.end).toBeGreaterThan(
        observation.versionDataBlock.start,
      );
      expect(observation.versionDataBlock.data).not.toContain(
        RELEASE_VERSION_DATA_BLOCK_CLOSE,
      );
      expect(JSON.parse(observation.versionDataBlock.data)).toBe(
        observation.releaseData.version,
      );
      expect(observation.prompt).not.toContain(
        `version ${observation.releaseData.version}`,
      );
      return true;
    });
  });

  it("keeps delimiter-like commit subject text inside the encoded data block", async () => {
    await expect(
      observeReleaseNotesPrompt(RELEASE_NOTES_PROMPT_CASE.DELIMITER_SUBJECT),
    ).resolves.toSatisfy((observation) => {
      expect(observation.subjectsDataBlock.start).toBeGreaterThan(-1);
      expect(observation.subjectsDataBlock.end).toBeGreaterThan(
        observation.subjectsDataBlock.start,
      );
      expect(observation.subjectsDataBlock.data).not.toContain(
        COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
      );
      expect(JSON.parse(observation.subjectsDataBlock.data)).toEqual(
        observation.subjects,
      );
      return true;
    });
  });

  it("keeps instruction-like changelog path text inside the encoded data block", async () => {
    await expect(
      observeReleaseNotesPrompt(RELEASE_NOTES_PROMPT_CASE.INSTRUCTION_PATH),
    ).resolves.toSatisfy((observation) => {
      expect(observation.pathDataBlock.start).toBeGreaterThan(-1);
      expect(observation.pathDataBlock.end).toBeGreaterThan(
        observation.pathDataBlock.start,
      );
      expect(observation.pathDataBlock.data).not.toContain(
        CHANGELOG_PATH_DATA_BLOCK_CLOSE,
      );
      expect(observation.stagedPromptPath).not.toBe(
        observation.expectedCanonicalPath,
      );
      expect(
        isPathContained(
          observation.request.workingDirectory,
          observation.stagedPromptPath,
        ),
      ).toBe(true);
      return true;
    });
  });

  it("uses a checked canonical staged path for an absolute in-tree configured changelog", async () => {
    await expect(observeAbsoluteInTreeReleaseNotesPath()).resolves.toSatisfy(
      (observation) => {
        expect(observation.stagedPromptPath).not.toBe(
          observation.expectedCanonicalPath,
        );
        expect(
          isPathContained(
            observation.promptWorkingDirectory,
            observation.stagedPromptPath,
          ),
        ).toBe(true);
        expect(observation.readBackPath).toBe(
          observation.expectedCanonicalPath,
        );
        expect(observation.finalContent).toBe(observation.expectedContent);
        return true;
      },
    );
  });
});

describe("composeReleaseNotes keeps the changelog path within the product working tree", () => {
  it("resolves a configured path inside the working tree and runs the agent there", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.CONFIGURED_INSIDE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.resolvedPathContained).toBe(true);
      expect(observation.agentRequestCount).toBe(1);
      return true;
    });
  });

  it("creates notes at a configured nested path whose parent directory does not exist", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.NESTED_MISSING_PARENT),
    ).resolves.toSatisfy((observation) => {
      expect(observation.finalContent).toBe(observation.expectedContent);
      expect(observation.agentRequestCount).toBe(1);
      return true;
    });
  });

  it("rejects a configured changelog path that already exists as a directory before invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.EXISTING_DIRECTORY),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path below an existing file before invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.BELOW_FILE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path below a symlink to a file before invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.BELOW_FILE_SYMLINK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("reads back from the checked canonical path when an in-tree symlink is configured", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.SYMLINK_READBACK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.readBackPath).toBe(observation.expectedReadBackPath);
      expect(observation.readBackPath).not.toBe(observation.resolvedPath);
      return true;
    });
  });

  it("accepts a missing default changelog when the working directory has a trailing separator", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.TRAILING_SEPARATOR),
    ).resolves.toSatisfy((observation) => {
      expect(observation.agentRequestCount).toBe(1);
      expect(observation.finalContent).toBe(observation.expectedContent);
      return true;
    });
  });

  it("rejects an in-tree symlink retarget after the agent writes the staged artifact before promotion", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.RETARGET_AFTER_STAGE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(1);
      expect(observation.actualArtifactCanonicalPath).toBeUndefined();
      expect(observation.replacementArtifactContent).toBe(
        observation.expectedReplacementArtifactContent,
      );
      return true;
    });
  });

  it("rejects a staged artifact symlink swap before staged read-back", async () => {
    await expect(
      observeReleaseNotesMutation(
        RELEASE_NOTES_MUTATION_CASE.STAGED_ARTIFACT_SYMLINK,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBeUndefined();
      return true;
    });
  });

  it("rejects notes that fail the faithfulness audit before promotion", async () => {
    await expect(
      observeReleaseNotesFaithfulness(RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.auditAttempted).toBe(true);
      expect(observation.actualReleaseData).toBe(
        observation.expectedReleaseData,
      );
      expect(observation.auditedSection).toContain(
        changelogVersionHeading(observation.expectedReleaseData.version),
      );
      expect(observation.promotionAttempted).toBe(false);
      expect(observation.canonicalOutputPath).toBeUndefined();
      return true;
    });
  });

  it("audits only the current release section when prior sections are preserved", async () => {
    await expect(
      observeReleaseNotesFaithfulness(
        RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.auditedSection?.trimEnd()).toBe(
        observation.expectedCurrentSection,
      );
      expect(observation.auditedSection).not.toContain(
        observation.priorVersion,
      );
      expect(observation.auditedSection).not.toContain(
        observation.preservedInstructionLikeText,
      );
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("passes the audited release section as JSON data to the production faithfulness auditor", async () => {
    await expect(
      observeReleaseNotesFaithfulness(
        RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.auditRequest?.workingDirectory).toBe(
        observation.workingDirectory,
      );
      expect(observation.auditSectionDataBlock.start).toBeGreaterThan(-1);
      expect(observation.auditSectionDataBlock.end).toBeGreaterThan(
        observation.auditSectionDataBlock.start,
      );
      expect(JSON.parse(observation.auditSectionDataBlock.data)).toBe(
        observation.productionAuditSection,
      );
      return true;
    });
  });

  it("rejects an ancestor directory swap during pre-agent revalidation without invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.PRE_AGENT_ANCESTOR_SWAP),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      expect(observation.actualArtifactCanonicalPath).toBeUndefined();
      expect(observation.symlinkCanonicalPath).toBe(
        observation.expectedSymlinkCanonicalPath,
      );
      return true;
    });
  });

  it("preserves the existing changelog when atomic promotion cannot finish its temporary write", async () => {
    await expect(observeReleaseNotesPartialWriteFailure()).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.finalContent).toBe(observation.expectedContent);
        expect(observation.directoryEntries).toEqual(
          observation.expectedDirectoryEntries,
        );
        return true;
      },
    );
  });

  it("rejects a checked canonical path swapped to a final symlink before accepting promotion", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.FINAL_SYMLINK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBe(
        observation.expectedCanonicalPath,
      );
      return true;
    });
  });

  it("rejects an ancestor directory swap before accepting promotion", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.ANCESTOR_READ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBe(
        observation.expectedCanonicalPath,
      );
      return true;
    });
  });

  it("rejects an ancestor directory swap before final promotion opens the target", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.PROMOTION_OPEN),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBe(
        observation.expectedCanonicalPath,
      );
      expect(observation.outsideContent).toBe(
        observation.expectedOutsideContent,
      );
      return true;
    });
  });

  it("rejects an ancestor directory swap before final promotion writes", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.FINAL_WRITE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBe(
        observation.expectedCanonicalPath,
      );
      expect(observation.outsideContent).toBe(
        observation.expectedOutsideContent,
      );
      return true;
    });
  });

  it("rejects an ancestor directory swap before creating a nested promotion parent", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.DIRECTORY_CREATE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.outsideArtifactCanonicalPath).toBeUndefined();
      expect(observation.outsideChildDirectoryCanonicalPath).toBeUndefined();
      return true;
    });
  });

  it("rejects an in-place changelog rewrite before read-back content is returned", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.IN_PLACE_REWRITE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      return true;
    });
  });

  it("rejects a configured changelog path that escapes the working tree without invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.ESCAPING),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path through a symlink that escapes the working tree", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.ESCAPING_SYMLINK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a final changelog-path symlink with a missing outside target before invoking the agent", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.DANGLING_FINAL_SYMLINK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path that traverses above a symlink target", async () => {
    await expect(
      observeReleaseNotesPath(RELEASE_NOTES_PATH_CASE.ABOVE_SYMLINK_TARGET),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a blank configured changelog path without invoking the agent", async () => {
    await expect(
      observeConfiguredReleaseNotesPathRejection(
        RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.BLANK,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path that resolves to the working tree root", async () => {
    await expect(
      observeConfiguredReleaseNotesPathRejection(
        RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.ROOT,
      ),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("allows a configured changelog path whose symlink ancestor resolves to the working tree root", async () => {
    await expect(observeReleaseNotesSymlinkToRootPath()).resolves.toSatisfy(
      (observation) => {
        expect(observation.result).toEqual(observation.expectedResult);
        expect(observation.agentRequestCount).toBe(1);
        return true;
      },
    );
  });
});

describe("isPathContained verifies release path containment edge cases directly", () => {
  it("classifies generated POSIX and Windows containment boundaries", async () => {
    await expect(observeReleaseNotesPathContainment()).resolves.toSatisfy(
      (observations) => {
        for (const observation of observations) {
          expect(observation.actual).toBe(observation.expected);
        }
        return true;
      },
    );
  });
});
