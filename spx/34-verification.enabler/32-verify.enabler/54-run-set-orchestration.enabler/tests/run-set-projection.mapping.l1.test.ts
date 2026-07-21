import { describe, expect, it } from "vitest";

import { projectRunSet } from "@/domains/verify/run-set";
import {
  probeFindingIdentity,
  probeScopeUnitKey,
  runSetPriorContextFilterCases,
  runSetProjectionCases,
} from "@testing/generators/verify/run-set";

describe("run-set projection mapping", () => {
  it.each(runSetProjectionCases())(
    "maps $label prior and current finding evidence to active, resolved, and reopened groups by stable finding identity",
    (mapping) => {
      const projection = projectRunSet({
        runs: mapping.runs,
        selector: mapping.selector,
        findingIdentity: probeFindingIdentity,
        scopeUnitKey: probeScopeUnitKey,
      });
      expect(projection.activeFindings).toEqual(mapping.expectedActive);
      expect(projection.resolvedFindings).toEqual(mapping.expectedResolved);
      expect(projection.reopenedFindings).toEqual(mapping.expectedReopened);
    },
  );

  it.each(runSetProjectionCases())(
    "maps $label prior and current scope evidence to coverage gaps through the shared merge-period envelope",
    (mapping) => {
      const projection = projectRunSet({
        runs: mapping.runs,
        selector: mapping.selector,
        findingIdentity: probeFindingIdentity,
        scopeUnitKey: probeScopeUnitKey,
      });
      expect(projection.coverageGaps.map(probeScopeUnitKey)).toEqual(mapping.expectedGapKeys);
      expect(projection.currentScope.map(probeScopeUnitKey)).toEqual(mapping.expectedCurrentScopeKeys);
    },
  );

  it.each(runSetPriorContextFilterCases())(
    "maps $backend prior context through the verification-type-provided selector before a producer receives context",
    (mapping) => {
      const projection = projectRunSet({
        runs: mapping.runs,
        selector: mapping.selector,
        findingIdentity: probeFindingIdentity,
        scopeUnitKey: probeScopeUnitKey,
        priorContext: (run) =>
          run.runToken === mapping.droppedRunToken
            ? undefined
            : { ...run, findings: run.findings.filter((finding) => finding.identity.rule === mapping.keepRule) },
      });
      expect(projection.resolvedFindings).toEqual(mapping.expectedResolved);
      expect(projection.priorRuns.map((run) => run.runToken)).not.toContain(mapping.droppedRunToken);
      const projectedFingerprints = [
        ...projection.priorRuns.flatMap((run) => run.findings),
        ...projection.activeFindings,
        ...projection.resolvedFindings,
        ...projection.reopenedFindings,
      ].map((finding) => finding.identity.fingerprint);
      for (const fingerprint of mapping.excludedFingerprints) {
        expect(projectedFingerprints).not.toContain(fingerprint);
      }
    },
  );
});
