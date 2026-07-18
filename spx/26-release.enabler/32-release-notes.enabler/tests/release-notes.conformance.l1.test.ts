import { ReleaseNotesError } from "@/domains/release/release-notes";
import {
  sampleAtxClosingHashesReleaseNotesChangelogCase,
  sampleCdataReleaseNotesChangelogCase,
  sampleConformantReleaseNotesChangelogCase,
  sampleCustomInlineHtmlReleaseNotesChangelogCase,
  sampleDuplicateCurrentVersionReleaseNotesChangelogCase,
  sampleH1BoundaryBeforeVersionReleaseNotesChangelogCase,
  sampleH1BoundaryReleaseNotesChangelogCase,
  sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase,
  sampleIndentedFenceReleaseNotesChangelogCase,
  sampleNonConformantReleaseNotesChangelogCases,
  sampleSameLineExplicitHtmlBlockReleaseNotesChangelogCase,
  sampleStandaloneInlineHtmlReleaseNotesChangelogCase,
  sampleTabbedHeadingReleaseNotesChangelogCase,
  sampleTabPaddedListBeforeChangeGroupReleaseNotesChangelogCase,
} from "@testing/generators/release/changelog";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  composeEveryReleaseNotesCase,
  composeReleaseNotesCase,
  type ReleaseNotesConformanceFailureObservation,
} from "@testing/harnesses/release/release-notes-conformance";
import { describe, expect, it } from "vitest";

describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
  it("accepts a changelog that conforms to Keep a Changelog with a section for the version", async () => {
    await expect(composeReleaseNotesCase(sampleConformantReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts literal fence text indented as code inside a conformant release section", async () => {
    await expect(composeReleaseNotesCase(sampleIndentedFenceReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts legal ATX closing hashes on release and change-group headings", async () => {
    await expect(composeReleaseNotesCase(sampleAtxClosingHashesReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts tab-separated release and change-group headings", async () => {
    await expect(composeReleaseNotesCase(sampleTabbedHeadingReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts a change-group heading after a tab-padded list item", async () => {
    await expect(composeReleaseNotesCase(sampleTabPaddedListBeforeChangeGroupReleaseNotesChangelogCase())).resolves
      .toSatisfy(
        (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
      );
  });

  it("accepts literal CDATA text inside a conformant release section", async () => {
    await expect(composeReleaseNotesCase(sampleCdataReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts a raw HTML block terminated by a blank line before the release section", async () => {
    await expect(composeReleaseNotesCase(sampleHtmlBlockTerminatedByBlankLineReleaseNotesChangelogCase())).resolves
      .toSatisfy(
        (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
      );
  });

  it("accepts a same-line explicit HTML block before the release section", async () => {
    await expect(composeReleaseNotesCase(sampleSameLineExplicitHtmlBlockReleaseNotesChangelogCase())).resolves
      .toSatisfy(
        (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
      );
  });

  it("accepts a standalone inline HTML tag before the release section", async () => {
    await expect(composeReleaseNotesCase(sampleStandaloneInlineHtmlReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("accepts a non-standalone custom HTML tag before the release section", async () => {
    await expect(composeReleaseNotesCase(sampleCustomInlineHtmlReleaseNotesChangelogCase())).resolves.toSatisfy(
      (observation) => independentKeepAChangelogConformance(observation.content, observation.version),
    );
  });

  it("rejects a changelog whose change group is in a later H1 section", async () => {
    await expect(composeReleaseNotesCase(sampleH1BoundaryReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects a changelog whose version section is in a later H1 section", async () => {
    await expect(composeReleaseNotesCase(sampleH1BoundaryBeforeVersionReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects a changelog with duplicate sections for the current version", async () => {
    await expect(composeReleaseNotesCase(sampleDuplicateCurrentVersionReleaseNotesChangelogCase())).rejects.toThrow(
      ReleaseNotesError,
    );
  });

  it("rejects every generated nonconformant changelog", async () => {
    await expect(composeEveryReleaseNotesCase(sampleNonConformantReleaseNotesChangelogCases())).resolves.toSatisfy(
      (results) =>
        results.every(
          (result: ReleaseNotesConformanceFailureObservation) => result.error instanceof ReleaseNotesError,
        ),
    );
  });
});
