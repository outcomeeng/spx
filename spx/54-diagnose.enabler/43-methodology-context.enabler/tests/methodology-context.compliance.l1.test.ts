import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { DIAGNOSE_RESOLVE_ERROR } from "@/domains/diagnose/resolve";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { METHODOLOGY_CODING_AGENT, METHODOLOGY_CODING_AGENTS } from "@/lib/methodology/coding-agent";
import { formatProvidesMismatchError, PROVIDER_MATCH } from "@/lib/methodology/provider-match";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  firstCheck,
  generatedMethodology,
  lineOf,
  mismatchedObservation,
  probeShippedTree,
  runDiagnoseWithLegacyMethodologySection,
  runDiagnoseWithUnavailableCheck,
  runDiagnoseWithUnrelatedLegacyDefect,
  runMethodologyDiagnoseJson,
  runMethodologyDiagnoseText,
  runMethodologyManifestWithoutFacts,
  shippedObservation,
  sourceRecordProviding,
  unavailableCheckName,
  undeclaredMethodology,
  unresolvedMethodology,
  withAgentHomesCarryingVersion,
  withShippedTreeRoot,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders methodology-context text from the check record", async () => {
    const methodology = generatedMethodology();
    const observation = shippedObservation(methodology);

    const output = await runMethodologyDiagnoseText(methodology, observation);

    expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED);
    expect(output).toContain(methodology.source);
    expect(output).toContain(methodology.version);
  });

  it("rejects methodology-context manifests without methodology facts", async () => {
    const error = await runMethodologyManifestWithoutFacts();

    expect(error).toContain(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(error).toContain(METHODOLOGY_SECTION);
  });

  it("reports the declared version, the migration source, and the shipped trees for the declared line", async () => {
    const methodology = generatedMethodology();
    const line = lineOf(methodology);

    await withShippedTreeRoot({ [line]: { codingAgents: [METHODOLOGY_CODING_AGENT.CLAUDE] } }, async (treeRoot) => {
      const observed = await probeShippedTree(methodology, treeRoot);

      expect(observed).toEqual(expect.objectContaining({
        line,
        shippedLines: [line],
        shippedCodingAgents: [METHODOLOGY_CODING_AGENT.CLAUDE],
        enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS],
        providerMatch: PROVIDER_MATCH.UNDECLARED,
        errored: false,
      }));
    });
  });

  it("reports the provider match as undeclared when the shipped record carries no provides, and mismatched when it disagrees", async () => {
    const methodology = generatedMethodology();
    const line = lineOf(methodology);
    const otherVersion = sampleGeneratedValue(
      arbitraryMethodologyVersion().filter((version) => version.text !== methodology.version),
    );

    await withShippedTreeRoot({
      [line]: { codingAgents: [...METHODOLOGY_CODING_AGENTS], sourceRecord: sourceRecordProviding(otherVersion.text) },
    }, async (treeRoot) => {
      const observed = await probeShippedTree(methodology, treeRoot);

      expect(observed.providerMismatch).toBe(
        formatProvidesMismatchError(
          methodology.version as string,
          otherVersion.text,
          METHODOLOGY_CODING_AGENTS[0] as string,
        ),
      );
    });
  });

  it("classifies a provider mismatch as broken", async () => {
    const methodology = generatedMethodology();
    const diagnostic = formatProvidesMismatchError(
      methodology.version as string,
      sampleGeneratedValue(arbitraryMethodologyVersion()).text,
      METHODOLOGY_CODING_AGENT.CODEX,
    );

    const report = await runMethodologyDiagnoseJson(methodology, mismatchedObservation(methodology, diagnostic));
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.MISMATCHED);
    expect(check.bucket).toBe(VERDICT_BUCKET.BROKEN);
    expect(check.readings).toEqual(expect.objectContaining({ providerMatch: diagnostic }));
  });

  it("classifies an undeclared version as degraded without probing a tree", async () => {
    const methodology = undeclaredMethodology();

    const report = await runMethodologyDiagnoseJson(methodology, unresolvedMethodology(false));
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNDECLARED);
    expect(check.bucket).toBe(VERDICT_BUCKET.DEGRADED);
  });

  it("never reads a coding agent's home: a plugin cache carrying the declared line changes nothing the probe observes", async () => {
    const methodology = generatedMethodology();

    await withShippedTreeRoot({}, async (treeRoot) => {
      await withAgentHomesCarryingVersion(methodology, async () => {
        const observed = await probeShippedTree(methodology, treeRoot);

        expect(observed.shippedLines).toEqual([]);
        expect(observed.shippedCodingAgents).toEqual([]);
        expect(observed.errored).toBe(false);
      });
    });
  });

  it("observes no shipped tree when the host supplies no tree root", async () => {
    const methodology = generatedMethodology();

    const observed = await probeShippedTree(methodology, undefined);

    expect(observed.shippedLines).toEqual([]);
    expect(observed.errored).toBe(false);
  });

  it("rejects stale harness methodology config before probing", async () => {
    const error = await runDiagnoseWithLegacyMethodologySection();

    expect(error).toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
  });

  it("ignores unrelated harness config defects before probing", async () => {
    const methodology = generatedMethodology();
    const observation = shippedObservation(methodology);

    const report = await runDiagnoseWithUnrelatedLegacyDefect(methodology, observation);

    expect(firstCheck(report).verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  });

  it("rejects unavailable checks before stale harness methodology config", async () => {
    const unavailableCheck = unavailableCheckName();

    const error = await runDiagnoseWithUnavailableCheck(unavailableCheck);

    expect(error).toContain(DIAGNOSE_RESOLVE_ERROR.UNAVAILABLE_CONFIGURED_CHECKS);
    expect(error).toContain(unavailableCheck);
    expect(error).not.toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
  });
});
