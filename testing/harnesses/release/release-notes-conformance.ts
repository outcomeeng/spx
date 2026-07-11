import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

import type { ReleaseData } from "@/domains/release/release-data";
import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import {
  sampleAtxClosingHashesReleaseNotesChangelogCase,
  sampleCdataReleaseNotesChangelogCase,
  sampleConformantReleaseNotesChangelogCase,
  sampleCustomInlineHtmlReleaseNotesChangelogCase,
  sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase,
  sampleIndentedFenceReleaseNotesChangelogCase,
  sampleNonConformantReleaseNotesChangelogCases,
  sampleSameLineExplicitHtmlBlockReleaseNotesChangelogCase,
  sampleStandaloneInlineHtmlReleaseNotesChangelogCase,
  sampleTabbedHeadingReleaseNotesChangelogCase,
  sampleTabPaddedListBeforeChangeGroupReleaseNotesChangelogCase,
} from "@testing/generators/release/changelog";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  approvingReleaseNotesFaithfulnessAuditor,
  expectRejectedReleaseNotesReadBack,
  rejectChangelogWithDuplicateCurrentVersion,
  rejectChangelogWithH1BoundaryBeforeChangeGroup,
  rejectChangelogWithH1BoundaryBeforeVersion,
} from "@testing/harnesses/release/release-notes-assertions";
import { type ReleaseNotesEnv, withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

interface ReleaseNotesChangelogCase {
  readonly releaseData: ReleaseData;
  readonly content: string;
}

async function expectConformantReadBack({ releaseData, content }: ReleaseNotesChangelogCase): Promise<void> {
  await withReleaseNotesEnv(async (env) => {
    const resolvedPath = await composeCase(env, { releaseData, content });

    await expect(env.readArtifact(resolvedPath)).resolves.toSatisfy(
      (notes) => independentKeepAChangelogConformance(notes, releaseData.version),
    );
  });
}

async function composeCase(env: ReleaseNotesEnv, { releaseData, content }: ReleaseNotesChangelogCase): Promise<string> {
  const config = {};
  const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, config);
  const agentRunner = new RecordingWritingAgentRunner(env.workingDirectory, resolvedPath, content);

  await expect(
    composeReleaseNotes({
      releaseData,
      config,
      workingDirectory: env.workingDirectory,
      agentRunner,
      readArtifact: env.readArtifact,
      createArtifactStage: env.createArtifactStage,
      promoteArtifact: env.promoteArtifact,
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    }),
  ).resolves.toEqual({ changelogPath: resolvedPath });
  return resolvedPath;
}

export function registerReleaseNotesConformanceTests(): void {
  describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
    it("accepts a changelog that conforms to Keep a Changelog with a section for the version", async () => {
      await expectConformantReadBack(sampleConformantReleaseNotesChangelogCase());
    });

    it("accepts literal fence text indented as code inside a conformant release section", async () => {
      await expectConformantReadBack(sampleIndentedFenceReleaseNotesChangelogCase());
    });

    it("accepts legal ATX closing hashes on release and change-group headings", async () => {
      await expectConformantReadBack(sampleAtxClosingHashesReleaseNotesChangelogCase());
    });

    it("accepts tab-separated release and change-group headings", async () => {
      await expectConformantReadBack(sampleTabbedHeadingReleaseNotesChangelogCase());
    });

    it("accepts a change-group heading after a tab-padded list item", async () => {
      await expectConformantReadBack(sampleTabPaddedListBeforeChangeGroupReleaseNotesChangelogCase());
    });

    it("accepts literal CDATA text inside a conformant release section", async () => {
      await expectConformantReadBack(sampleCdataReleaseNotesChangelogCase());
    });

    it("accepts a raw HTML block terminated by a blank line before the release section", async () => {
      await expectConformantReadBack(sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase());
    });

    it("accepts a same-line explicit HTML block before the release section", async () => {
      await expectConformantReadBack(sampleSameLineExplicitHtmlBlockReleaseNotesChangelogCase());
    });

    it("accepts a standalone inline HTML tag before the release section", async () => {
      await expectConformantReadBack(sampleStandaloneInlineHtmlReleaseNotesChangelogCase());
    });

    it("accepts a non-standalone custom HTML tag before the release section", async () => {
      await expectConformantReadBack(sampleCustomInlineHtmlReleaseNotesChangelogCase());
    });

    it(
      "rejects a changelog whose change group is in a later H1 section",
      rejectChangelogWithH1BoundaryBeforeChangeGroup,
    );

    it(
      "rejects a changelog whose version section is in a later H1 section",
      rejectChangelogWithH1BoundaryBeforeVersion,
    );

    it(
      "rejects a changelog with duplicate sections for the current version",
      rejectChangelogWithDuplicateCurrentVersion,
    );

    for (const { releaseData, content, label } of sampleNonConformantReleaseNotesChangelogCases()) {
      it(`rejects a changelog that ${label}`, async () => {
        await expectRejectedReleaseNotesReadBack({ releaseData, content });
      });
    }
  });
}

export const releaseNotesConformanceCases = collectHarnessTestCases(registerReleaseNotesConformanceTests);
