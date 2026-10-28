import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  type VerifyFinishReport,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_TERMINAL_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// Assertion design records. Every case runs the production `finish` against a real Git repository whose
// linked state store is the checkout's own `.spx/`, with the payload directory at its specified layout.
//
// Removal — "once `finish` seals a run, the run's payload directory no longer exists, a `finish` that
// records no terminal completion removes nothing, a repeated `finish` returns the existing terminal
// projection, and `render` and `input` succeed" (universal over verification types; compliance).
//   Production subject / seam: `verifyFinishCommand`, observed through the real filesystem (directory
//   existence), the journal's events, and the `render` and `input` command results.
//   Case provenance: the spec sentence; the verification-type enumeration is the source-owned
//   `VERIFY_VERIFICATION_TYPE`; terminal statuses come from the evidence-free terminal-status generator,
//   the rejected status from the invalid-terminal-status generator; payload file names from the run-token
//   generator.
//   Oracle owner: the assertion text itself — existence before and absence after — and the journal
//   terminal-event type constant for "records no terminal completion".
//   Rejected mutation: `finish` stops removing the directory (or removes it before sealing, or on a
//   rejected finish).
//   Failure observation: `directoryExists` after a sealing `finish` is true; or after a rejected `finish`
//   is false; or the recorded removals are not empty after a rejected `finish`.
//
// Failed removal — "when removing the payload directory of a sealed run fails, `finish` leaves the run
// sealed, reports the terminal projection as it would without the failure, and writes a diagnostic naming
// the directory to standard error, and a later `start` removes the directory".
//   Production subject / seam: `verifyFinishCommand` with an injected filesystem whose `rm` fails for the
//   payload directory — Stage 5 exception 1 (failure simulation): the real filesystem cannot make a
//   removal of a directory it created fail cheaply and portably — and an injected standard-error sink;
//   a following `verifyStartCommand` runs on the real filesystem.
//   Case provenance: the spec sentence; the projection oracle is a second run of the same verification
//   type finished without the failure.
//   Oracle owner: the unfailed `finish` of the production lifecycle for the projection, the assertion
//   text for the diagnostic naming the directory and for the later removal.
//   Rejected mutation: `finish` propagates the removal failure as an error result, or leaves the run
//   unsealed, or writes no diagnostic, or names another path.
//   Failure observation: the finish exit code is not OK, the status reports `sealed: false`, the projection
//   differs from the reference, or the standard-error text lacks the directory path.
//
// Run-relative terminal metadata — "`finish` whose terminal metadata a run-relative name selects reads the
// file of that name in the run's payload directory, and rejects a name whose path, resolved through
// symbolic links, lies outside that directory before recording terminal completion".
//   Production subject / seam: `verifyFinishCommand` with `terminalMetadataRunPayload`, observed through
//   the paths the injected filesystem reads, the journal's events, the status, and the finish result.
//   Case provenance: the spec sentence; metadata documents from the review terminal-metadata generator;
//   names from the run-token generators; the outside file is staged by the test case below the checkout
//   or in the payload root.
//   Oracle owner: `VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY` from its production owner for the
//   rejection; the generated metadata document for the projection a conforming name reports.
//   Rejected mutation: the containment check is removed from the run-relative terminal-metadata read, or
//   runs after the read, or the read ignores the name.
//   Failure observation: a recorded read of the outside file, a missing containment diagnostic, a
//   terminal-completion event in the journal, or a sealed status; for a conforming name, no recorded read
//   of the staged file or a projection without the staged metadata.
describe("verify finish payload directory removal", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "removes a %s run's payload directory once finish seals the run, and render and input succeed",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        const stagedName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        await repository.stagePayloadFile(payloadDirectory, stagedName);
        const existedBefore = await repository.directoryExists(payloadDirectory);

        const finished = await repository.finish(run, terminalStatus);
        const existsAfter = await repository.directoryExists(payloadDirectory);
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        const rendered = await repository.render(run);
        const input = await repository.input(run);

        expect(existedBefore).toBe(true);
        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(status.sealed).toBe(true);
        expect(existsAfter).toBe(false);
        expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(input.exitCode, input.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "returns the existing terminal projection on a repeated finish of a %s run whose payload directory is removed",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        const first = await repository.finish(run, terminalStatus);
        const eventsAfterFirst = await repository.readEvents(run);

        const repeated = await repository.finish(run, terminalStatus);

        expect(first.exitCode, first.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(await repository.directoryExists(payloadDirectory)).toBe(false);
        expect(repeated.exitCode, repeated.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(repeated.output).toBe(first.output);
        expect(await repository.readEvents(run)).toEqual(eventsAfterFirst);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "leaves a %s run's payload directory in place when finish rejects its terminal status and records no terminal completion",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        const stagedName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        await repository.stagePayloadFile(payloadDirectory, stagedName);
        const invalidStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.invalidTerminalStatus());

        const observed = await repository.observeFinish(run, { terminalStatus: invalidStatus });
        const events = await repository.readEvents(run);

        expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observed.finished.output).toContain(VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID);
        expect(events.some((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE)).toBe(false);
        expect(observed.removedPaths).toEqual([]);
        expect(await repository.directoryExists(payloadDirectory)).toBe(true);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "seals a %s run and reports its unfailed projection when removing the payload directory fails, and a later start removes it",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const reference = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        const failing = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(reference.started.exitCode, reference.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(failing.started.exitCode, failing.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const failingDirectory = repository.payloadDirectory(verificationType, failing.runToken ?? "");
        const stagedName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        await repository.stagePayloadFile(failingDirectory, stagedName);
        const unfailed = await repository.finish(reference, terminalStatus);

        const observed = await repository.observeFinish(failing, {
          terminalStatus,
          failRemovalOf: failingDirectory,
        });
        const status = JSON.parse((await repository.status(failing)).output) as VerifyStatusReport;
        const events = await repository.readEvents(failing);
        const existsAfterFailure = await repository.directoryExists(failingDirectory);
        const later = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);

        const unfailedReport = JSON.parse(unfailed.output) as VerifyFinishReport;
        expect(unfailed.exitCode, unfailed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(JSON.parse(observed.finished.output)).toEqual({ ...unfailedReport, runToken: failing.runToken });
        expect(status.sealed).toBe(true);
        expect(events.filter((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE)).toHaveLength(1);
        expect(observed.removedPaths).toContain(failingDirectory);
        expect(observed.stderr).toContain(failingDirectory);
        expect(existsAfterFailure).toBe(true);
        expect(later.started.exitCode, later.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(await repository.directoryExists(failingDirectory)).toBe(false);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "reads the terminal metadata file of the staged name in a %s run's payload directory",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
        const name = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        await repository.stagePayloadContent(payloadDirectory, name, JSON.stringify(metadata));

        const observed = await repository.observeFinish(run, {
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          terminalMetadataRunPayload: name,
        });

        expect(observed.readPaths).toContain(join(payloadDirectory, name));
      });
    },
  );

  it("reports the terminal metadata of the staged name in a review run's payload directory", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.REVIEW);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
      const name = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
      const payloadDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? "");
      await repository.stagePayloadContent(payloadDirectory, name, JSON.stringify(metadata));

      const observed = await repository.observeFinish(run, {
        terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
        terminalMetadataRunPayload: name,
      });

      expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(observed.finished.output) as VerifyFinishReport).terminalMetadata).toEqual(metadata);
    });
  });

  it("reports the terminal metadata a symbolic link in a review run's payload directory resolves to inside it", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, VERIFY_VERIFICATION_TYPE.REVIEW);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
      const names = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.payloadNamePair());
      const payloadDirectory = repository.payloadDirectory(VERIFY_VERIFICATION_TYPE.REVIEW, run.runToken ?? "");
      await repository.stagePayloadContent(payloadDirectory, names.first, JSON.stringify(metadata));
      await repository.linkPayload(payloadDirectory, names.second, join(payloadDirectory, names.first));

      const observed = await repository.observeFinish(run, {
        terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
        terminalMetadataRunPayload: names.second,
      });

      expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect((JSON.parse(observed.finished.output) as VerifyFinishReport).terminalMetadata).toEqual(metadata);
      expect(observed.readPaths).toContain(join(payloadDirectory, names.first));
    });
  });

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a terminal metadata name of a symbolic link in a %s run's payload directory that resolves outside it, before any read",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
        const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const linkName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        const outsideFile = join(repository.productDir, outsideName);
        await repository.stagePayloadContent(repository.productDir, outsideName, JSON.stringify(metadata));
        await repository.linkPayload(payloadDirectory, linkName, outsideFile);

        const observed = await repository.observeFinish(run, {
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          terminalMetadataRunPayload: linkName,
        });
        const events = await repository.readEvents(run);
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;

        expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observed.finished.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
        expect(events.some((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE)).toBe(false);
        expect(status.sealed).toBe(false);
        expect(observed.readPaths).not.toContain(outsideFile);
        expect(observed.removedPaths).toEqual([]);
        expect(await repository.directoryExists(payloadDirectory)).toBe(true);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "rejects a terminal metadata name of a parent-directory segment that leaves a %s run's payload directory, before any read",
    async (verificationType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        const run = await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, verificationType);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const metadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
        const outsideName = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
        const payloadDirectory = repository.payloadDirectory(verificationType, run.runToken ?? "");
        const outsideDirectory = dirname(payloadDirectory);
        await repository.stagePayloadContent(outsideDirectory, outsideName, JSON.stringify(metadata));

        const observed = await repository.observeFinish(run, {
          terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
          terminalMetadataRunPayload: `../${outsideName}`,
        });
        const events = await repository.readEvents(run);
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;

        expect(observed.finished.exitCode, observed.finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observed.finished.output).toContain(VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY);
        expect(events.some((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE)).toBe(false);
        expect(status.sealed).toBe(false);
        expect(observed.readPaths).not.toContain(join(outsideDirectory, outsideName));
        expect(observed.removedPaths).toEqual([]);
        expect(await repository.directoryExists(payloadDirectory)).toBe(true);
      });
    },
  );
});
