import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  isVerifyVerificationType,
  PROBE_PAYLOAD_FIELD,
  PROBE_UNIT_KIND,
  runJudgedPathsOf,
  TERMINAL_REQUIREMENT,
  terminalMetadataValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { PROBE_TEST_GENERATOR, type ProbeRunUnits } from "@testing/generators/verify/probe";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  addProbeFinding,
  addProbeScope,
  finishProbeRun,
  type ProbeRunEnv,
  probeRunEvents,
  probeRunStatus,
  startProbeChangesetRun,
  startProbeRun,
} from "@testing/harnesses/verify/probe";
import { withVerifyCommittedFileRepository } from "@testing/harnesses/verify/repository";

function drawUnits(): ProbeRunUnits {
  return sampleVerifyTestValue(PROBE_TEST_GENERATOR.runUnits());
}

async function expectAdded(result: Promise<{ readonly exitCode: number; readonly output: string }>): Promise<void> {
  const added = await result;
  expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
}

/** Add `payload` as scope evidence, expect the refusal to name `named`, and expect the journal unchanged. */
async function expectScopeRefused(run: ProbeRunEnv, payload: unknown, named: string): Promise<void> {
  const before = await probeRunEvents(run);
  const added = await addProbeScope(run, payload);
  expect(added.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(added.output).toContain(named);
  expect(await probeRunEvents(run)).toEqual(before);
}

/** A run rooted in its protocol unit, with the further units given recorded after it. */
async function rootedRun(units: ProbeRunUnits, ...further: readonly unknown[]): Promise<ProbeRunEnv> {
  const run = await startProbeRun(units.protocol);
  await expectAdded(addProbeScope(run, units.protocolUnit));
  for (const unit of further) await expectAdded(addProbeScope(run, unit));
  return run;
}

describe("probe-type-registered", () => {
  it("registers probe with scope, finding and terminal validators", () => {
    expect(isVerifyVerificationType(VERIFY_VERIFICATION_TYPE.PROBE)).toBe(true);
    expect(evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.PROBE, VERIFY_EVIDENCE_KIND.SCOPE)).toBeDefined();
    expect(evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.PROBE, VERIFY_EVIDENCE_KIND.FINDING)).toBeDefined();
    expect(terminalMetadataValidatorFor(VERIFY_VERIFICATION_TYPE.PROBE)).toBeDefined();
  });

  it("starts a probe run whose status advertises scope add and finding add, and accepts scope, finding and finish", async () => {
    const units = drawUnits();
    const run = await startProbeRun(units.protocol);

    expect((await probeRunStatus(run)).nextActions).toEqual(
      expect.arrayContaining([VERIFY_LIFECYCLE_ACTION.SCOPE_ADD, VERIFY_LIFECYCLE_ACTION.FINDING_ADD]),
    );
    for (const unit of [units.protocolUnit, units.assertionUnit, units.artifactUnit]) {
      await expectAdded(addProbeScope(run, unit));
    }
    await expectAdded(addProbeFinding(run, sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units))));
    await expectAdded(finishProbeRun(run, JOURNAL_RUN_STATE_STATUS.FAILED));
  });
});

describe("protocol-root", () => {
  it("accepts as first unit the protocol unit equal to the file scope of a probe.md under a Node's probes/", async () => {
    const units = drawUnits();
    const run = await startProbeRun(units.protocol);

    await expectAdded(addProbeScope(run, units.protocolUnit));
  });

  it("refuses a protocol unit in a changeset-scoped run", async () => {
    const run = await startProbeChangesetRun();
    const protocol = {
      [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.PROTOCOL,
      [PROBE_PAYLOAD_FIELD.SUBJECT]: run.scenario.scope,
    };

    await expectScopeRefused(run, protocol, EVIDENCE_REQUIREMENT.PROBE_PROTOCOL_ROOTS_RUN);
  });

  it("refuses a protocol unit whose file scope names no probe.md directly in a directory under probes/", async () => {
    const path = sampleVerifyTestValue(PROBE_TEST_GENERATOR.nonProtocolPath());
    const run = await startProbeRun(path);
    const protocol = { [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.PROTOCOL, [PROBE_PAYLOAD_FIELD.SUBJECT]: path };

    await expectScopeRefused(run, protocol, EVIDENCE_REQUIREMENT.PROBE_PROTOCOL_ROOTS_RUN);
  });

  it("refuses a first protocol unit whose subject differs from the run's file scope", async () => {
    const units = drawUnits();
    const other = sampleVerifyTestValue(PROBE_TEST_GENERATOR.protocolPath().filter((path) => path !== units.protocol));
    const run = await startProbeRun(units.protocol);

    await expectScopeRefused(
      run,
      { ...units.protocolUnit, [PROBE_PAYLOAD_FIELD.SUBJECT]: other },
      EVIDENCE_REQUIREMENT.PROBE_PROTOCOL_ROOTS_RUN,
    );
  });

  it("refuses any other unit kind as the first unit", async () => {
    const units = drawUnits();
    for (const first of [units.assertionUnit, units.artifactUnit, units.unexercisedUnit]) {
      const run = await startProbeRun(units.protocol);
      await expectScopeRefused(run, first, EVIDENCE_REQUIREMENT.PROBE_PROTOCOL_ROOTS_RUN);
    }
  });

  it("refuses a protocol unit as any later unit", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit);

    await expectScopeRefused(run, units.protocolUnit, EVIDENCE_REQUIREMENT.PROBE_PROTOCOL_IS_FIRST_UNIT);
  });
});

describe("artifact-retained", () => {
  it("accepts an artifact unit naming a <slug>.<ext> file directly in the protocol's directory", async () => {
    const units = drawUnits();
    const run = await rootedRun(units);

    await expectAdded(addProbeScope(run, units.artifactUnit));
  });

  it("refuses an artifact under runs/, in another subdirectory, named probe.md, outside <slug>.<ext>, or beside no protocol", async () => {
    const units = drawUnits();
    const run = await rootedRun(units);
    const subject = sampleVerifyTestValue(PROBE_TEST_GENERATOR.refusedArtifactSubject(units.protocol));

    await expectScopeRefused(
      run,
      { ...units.artifactUnit, [PROBE_PAYLOAD_FIELD.SUBJECT]: subject },
      EVIDENCE_REQUIREMENT.PROBE_ARTIFACT_IN_PROTOCOL_DIRECTORY,
    );
  });

  it("refuses to finish a probe run that recorded no artifact unit, and records nothing", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit);
    const before = await probeRunEvents(run);

    const finished = await finishProbeRun(run, JOURNAL_RUN_STATE_STATUS.PASSED);

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toContain(TERMINAL_REQUIREMENT.PROBE_RETAINS_ARTIFACT);
    expect(await probeRunEvents(run)).toEqual(before);
  });
});

describe("assertion-observed", () => {
  it("refuses to finish a probe run that recorded no assertion unit, and records nothing", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.artifactUnit);
    const before = await probeRunEvents(run);

    const finished = await finishProbeRun(run, JOURNAL_RUN_STATE_STATUS.PASSED);

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toContain(TERMINAL_REQUIREMENT.PROBE_OBSERVES_ASSERTION);
    expect(await probeRunEvents(run)).toEqual(before);
  });
});

describe("observed-paths", () => {
  it("records the judged files a probe scope unit names among the files the sealed run judged", async () => {
    await withVerifyCommittedFileRepository(async (repository) => {
      const run = await repository.startFileRun(VERIFY_VERIFICATION_TYPE.PROBE);
      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const directory = PROBE_TEST_GENERATOR.protocolDirectory(run.scope);
      const artifact = `${directory}/${sampleVerifyTestValue(PROBE_TEST_GENERATOR.artifactName())}`;
      const units: readonly JsonValue[] = [
        sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedScopeUnit(VERIFY_VERIFICATION_TYPE.PROBE, run.scope, [repository.filePath]),
        ),
        { [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.ARTIFACT, [PROBE_PAYLOAD_FIELD.SUBJECT]: artifact },
        {
          [PROBE_PAYLOAD_FIELD.UNIT_KIND]: PROBE_UNIT_KIND.ASSERTION,
          [PROBE_PAYLOAD_FIELD.SUBJECT]: repository.filePath,
          [PROBE_PAYLOAD_FIELD.SLUG]: sampleVerifyTestValue(PROBE_TEST_GENERATOR.slug()),
        },
      ];
      for (const unit of units) {
        const appended = await repository.appendScope(run, unit);
        expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      }

      const finished = await repository.finish(run, JOURNAL_RUN_STATE_STATUS.PASSED);

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(runJudgedPathsOf(await repository.readEvents(run))).toContain(repository.filePath);
    });
  });
});

describe("departure-finding", () => {
  it("accepts a finding naming a recorded assertion unit and a recorded artifact unit, with message and evidence", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit, units.artifactUnit);

    await expectAdded(addProbeFinding(run, sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units))));
  });

  it("refuses a finding naming an assertion slug the run did not record, and appends nothing", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit, units.artifactUnit);
    const finding = sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units));
    const slug = sampleVerifyTestValue(
      PROBE_TEST_GENERATOR.slug().filter((drawn) => drawn !== units.assertionUnit.slug),
    );
    const before = await probeRunEvents(run);

    const added = await addProbeFinding(run, { ...finding, [PROBE_PAYLOAD_FIELD.SLUG]: slug });

    expect(added.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(added.output).toContain(EVIDENCE_REQUIREMENT.PROBE_FINDING_ASSERTION_IS_RECORDED);
    expect(await probeRunEvents(run)).toEqual(before);
  });

  it("refuses a finding naming an artifact the run did not record, and appends nothing", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit);
    const before = await probeRunEvents(run);

    const added = await addProbeFinding(run, sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units)));

    expect(added.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(added.output).toContain(EVIDENCE_REQUIREMENT.PROBE_FINDING_ARTIFACT_IS_RECORDED);
    expect(await probeRunEvents(run)).toEqual(before);
  });
});

describe("field-named-refusal", () => {
  const SCOPE_FIELDS = [PROBE_PAYLOAD_FIELD.UNIT_KIND, PROBE_PAYLOAD_FIELD.SUBJECT] as const;
  const FINDING_FIELDS = [
    [PROBE_PAYLOAD_FIELD.ASSERTION_SUBJECT],
    [PROBE_PAYLOAD_FIELD.SLUG],
    [PROBE_PAYLOAD_FIELD.ARTIFACT_SUBJECT],
    [PROBE_PAYLOAD_FIELD.MESSAGE],
    [PROBE_PAYLOAD_FIELD.EVIDENCE],
    [PROBE_PAYLOAD_FIELD.EVIDENCE, PROBE_PAYLOAD_FIELD.OBSERVED],
    [PROBE_PAYLOAD_FIELD.EVIDENCE, PROBE_PAYLOAD_FIELD.EXPECTED],
  ] as const;

  it.each(SCOPE_FIELDS)("refuses a scope unit without %s before any event appends, naming the field", async (field) => {
    const units = drawUnits();
    const run = await startProbeRun(units.protocol);
    const { [field]: _dropped, ...payload } = units.protocolUnit;

    await expectScopeRefused(run, payload, `"${field}"`);
  });

  it.each(FINDING_FIELDS)(
    "refuses a finding without %s before any event appends, naming the field path",
    async (...path) => {
      const units = drawUnits();
      const run = await rootedRun(units, units.assertionUnit, units.artifactUnit);
      const finding = structuredClone(sampleVerifyTestValue(PROBE_TEST_GENERATOR.findingFor(units))) as Record<
        string,
        unknown
      >;
      const parent = path.length === 1 ? finding : finding[path[0]] as Record<string, unknown>;
      delete parent[path[path.length - 1] ?? ""];
      const before = await probeRunEvents(run);

      const added = await addProbeFinding(run, finding);

      expect(added.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(added.output).toContain(`"${path.join(".")}"`);
      expect(await probeRunEvents(run)).toEqual(before);
    },
  );
});

describe("no-terminal-metadata", () => {
  it("refuses supplied terminal metadata at finish, and records nothing", async () => {
    const units = drawUnits();
    const run = await rootedRun(units, units.assertionUnit, units.artifactUnit);
    const before = await probeRunEvents(run);

    const finished = await finishProbeRun(run, JOURNAL_RUN_STATE_STATUS.PASSED, {
      [PROBE_PAYLOAD_FIELD.MESSAGE]: sampleVerifyTestValue(PROBE_TEST_GENERATOR.slug()),
    });

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toContain(TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED);
    expect(await probeRunEvents(run)).toEqual(before);
  });
});
