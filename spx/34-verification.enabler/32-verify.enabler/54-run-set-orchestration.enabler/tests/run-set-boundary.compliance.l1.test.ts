import { describe, expect, it } from "vitest";

import { readRunSetContext } from "@/commands/verify/run-set";
import { foldRunSetRunEvidence, MERGE_PERIOD_BACKEND } from "@/domains/verify/run-set";
import {
  jsonScopeUnitKey,
  reviewPayloadProbeIdentity,
  sampleRunSetAuditBoundaryScenario,
  sampleRunSetBoundaryScenario,
} from "@testing/generators/verify/run-set";

describe("run-set prior-context boundary compliance", () => {
  it("restores the same typed prior-run evidence when rendered comment and terminal-output events are interleaved", () => {
    const scenario = sampleRunSetBoundaryScenario();
    const restored = foldRunSetRunEvidence({
      verificationType: scenario.verificationType,
      selector: scenario.runSelector,
      events: scenario.noisyPriorRun.events,
    });
    expect(restored).toEqual(
      foldRunSetRunEvidence({
        verificationType: scenario.verificationType,
        selector: scenario.runSelector,
        events: scenario.priorRun.events,
      }),
    );
    expect(restored.scopeUnits).toEqual(scenario.expectedScopePayloads);
    expect(restored.findings).toEqual(scenario.expectedFindingPayloads);
    expect(JSON.stringify(restored)).not.toContain(scenario.renderedNoiseMarker);
  });

  it("restores an audit run's root scope, child scope, and finding exactly as recorded", () => {
    const scenario = sampleRunSetAuditBoundaryScenario();
    const restored = foldRunSetRunEvidence({
      verificationType: scenario.verificationType,
      selector: scenario.runSelector,
      events: scenario.events,
    });
    expect(restored.scopeUnits).toEqual(scenario.expectedScopePayloads);
    expect(restored.findings).toEqual(scenario.expectedFindingPayloads);
  });

  it("restores the same typed prior-run evidence when raw journal-event envelope fields differ", () => {
    const scenario = sampleRunSetBoundaryScenario();
    expect(
      foldRunSetRunEvidence({
        verificationType: scenario.verificationType,
        selector: scenario.runSelector,
        events: scenario.envelopeVariantPriorRun.events,
      }),
    ).toEqual(
      foldRunSetRunEvidence({
        verificationType: scenario.verificationType,
        selector: scenario.runSelector,
        events: scenario.priorRun.events,
      }),
    );
  });

  it("restores producer prior-run context through injected run evidence without rendered inputs", async () => {
    const scenario = sampleRunSetBoundaryScenario();
    const contextFor = (prior: typeof scenario.priorRun) =>
      readRunSetContext({
        readRuns: () => Promise.resolve([prior, scenario.currentRun]),
        selector: {
          mergePeriod: { backend: MERGE_PERIOD_BACKEND.LOCAL, branch: scenario.priorRun.metadata.branchSlug },
          verificationType: scenario.verificationType,
          scopeType: scenario.runSelector.scopeType,
          runSetScopeKey: scenario.priorRun.metadata.branchSlug,
        },
        runAddress: (run) => ({
          mergePeriod: { backend: MERGE_PERIOD_BACKEND.LOCAL, branch: run.metadata.branchSlug },
          verificationType: run.metadata.type,
          scopeType: scenario.runSelector.scopeType,
          runSetScopeKey: run.metadata.branchSlug,
          scopeIdentity: scenario.scopeIdentityByToken[run.runToken] ?? run.runToken,
        }),
        findingIdentity: reviewPayloadProbeIdentity,
        scopeUnitKey: jsonScopeUnitKey,
      });
    const fromTypedEvidence = await contextFor(scenario.priorRun);
    await expect(contextFor(scenario.noisyPriorRun)).resolves.toEqual(fromTypedEvidence);
    expect(fromTypedEvidence.resolvedFindings).toEqual(scenario.expectedFindingPayloads);
    expect(fromTypedEvidence.coverageGaps).toEqual(scenario.expectedScopePayloads);
    expect(JSON.stringify(fromTypedEvidence)).not.toContain(scenario.renderedNoiseMarker);
  });
});
