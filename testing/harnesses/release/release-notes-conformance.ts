import { describe, expect, it } from "vitest";

import type { ReleaseData } from "@/domains/release/release-data";
import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import {
  sampleAtxClosingHashesReleaseNotesChangelogCase,
  sampleCdataReleaseNotesChangelogCase,
  sampleConformantReleaseNotesChangelogCase,
  sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase,
  sampleIndentedFenceReleaseNotesChangelogCase,
  sampleNonConformantReleaseNotesChangelogCases,
  sampleTabbedHeadingReleaseNotesChangelogCase,
} from "@testing/generators/release/changelog";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  expectRejectedReleaseNotesReadBack,
  rejectChangelogWithH1BoundaryBeforeChangeGroup,
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
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    }),
  ).resolves.toBeUndefined();
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

    it("accepts literal CDATA text inside a conformant release section", async () => {
      await expectConformantReadBack(sampleCdataReleaseNotesChangelogCase());
    });

    it("accepts a raw HTML block terminated by a blank line before the release section", async () => {
      await expectConformantReadBack(sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase());
    });

    it(
      "rejects a changelog whose change group is in a later H1 section",
      rejectChangelogWithH1BoundaryBeforeChangeGroup,
    );

    for (const { releaseData, content, label } of sampleNonConformantReleaseNotesChangelogCases()) {
      it(`rejects a changelog that ${label}`, async () => {
        await expectRejectedReleaseNotesReadBack({ releaseData, content });
      });
    }
  });
}
