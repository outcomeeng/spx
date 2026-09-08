import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { AGENT, METHODOLOGY_CODING_AGENT_BY_AGENT } from "@/domains/agent-environment/config";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { DIAGNOSE_RESOLVE_ERROR } from "@/domains/diagnose/resolve";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import {
  formatProvidesMismatchError,
  METHODOLOGY_CODING_AGENT,
  METHODOLOGY_CODING_AGENTS,
  PROVIDER_MATCH,
} from "@/lib/methodology";
import {
  arbitraryMethodologyVersion,
  generatedSourceRecordProviding,
  generatedSourceRecordWithPluginVersion,
  supportsRangeAlternatives,
  supportsRangeContaining,
  supportsRangeExcluding,
  supportsRangeSpanning,
  supportsRangeSpanningBelow,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  firstCheck,
  generatedMethodology,
  generatedMigratingMethodology,
  lineOf,
  mismatchedObservation,
  probeShippedTree,
  probeShippedTreeForProduct,
  runDiagnoseWithLegacyMethodologySection,
  runDiagnoseWithUnavailableCheck,
  runDiagnoseWithUnrelatedLegacyDefect,
  runMethodologyDiagnoseJson,
  runMethodologyDiagnoseText,
  runMethodologyManifestWithoutFacts,
  shippedObservation,
  unavailableCheckName,
  undeclaredMethodology,
  unresolvedMethodology,
  unshippedObservation,
  withAgentHomesCarryingVersion,
  withShippedTreeRoot,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders every verdict's text from the same check record as the JSON report", async () => {
    const declared = generatedMethodology();
    const mismatch = formatProvidesMismatchError(
      declared.version as string,
      sampleGeneratedValue(arbitraryMethodologyVersion()).text,
      METHODOLOGY_CODING_AGENT.CODEX,
    );
    for (
      const [methodology, observation, header] of [
        [declared, shippedObservation(declared), DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED],
        [declared, unshippedObservation(declared, []), DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE],
        [declared, mismatchedObservation(declared, mismatch), DIAGNOSE_TEXT_HEADER.METHODOLOGY_MISMATCHED],
        [declared, unresolvedMethodology(true), DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNKNOWN],
        [undeclaredMethodology(), unresolvedMethodology(false), DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNDECLARED],
      ] as const
    ) {
      const check = firstCheck(await runMethodologyDiagnoseJson(methodology, observation));
      const readings = check.readings as Record<string, string>;
      const text = await runMethodologyDiagnoseText(methodology, observation);

      expect(text, String(check.verdict)).toContain(header);
      // The unknown verdict renders only its retry guidance; every other verdict
      // renders the configured source the JSON record carries, and the verdicts
      // over a declared version render that version too. The mismatched verdict
      // additionally renders the provider diagnostic that names the disagreement,
      // so the text report withholds nothing the JSON record carries.
      if (check.verdict === METHODOLOGY_CONTEXT_VERDICT.UNKNOWN) continue;
      expect(text, String(check.verdict)).toContain(readings.configuredSource);
      if (methodology.version !== undefined) {
        expect(text, String(check.verdict)).toContain(readings.configuredVersion);
      }
      if (check.verdict === METHODOLOGY_CONTEXT_VERDICT.MISMATCHED) {
        expect(text, String(check.verdict)).toContain(readings.providerMatch);
      }
    }
  });

  it("resolves the enabled coding agents from the product's harness-environment config when no resolver is injected", async () => {
    const methodology = generatedMethodology();
    const line = lineOf(methodology);

    await withShippedTreeRoot({ [line]: { codingAgents: [METHODOLOGY_CODING_AGENT.CLAUDE] } }, async (treeRoot) => {
      const observed = await probeShippedTreeForProduct(methodology, treeRoot, [AGENT.CLAUDE_CODE]);

      expect(observed).toEqual(expect.objectContaining({
        enabledCodingAgents: [METHODOLOGY_CODING_AGENT_BY_AGENT[AGENT.CLAUDE_CODE]],
        shippedCodingAgents: [METHODOLOGY_CODING_AGENT.CLAUDE],
        providerMatch: PROVIDER_MATCH.UNDECLARED,
        errored: false,
      }));
    });
  });

  it("never compares the declared version against a plugin version: an equal plugin version without a provider block stays undeclared, and a provider match holds under any plugin version", async () => {
    const methodology = generatedMethodology();
    const line = lineOf(methodology);

    await withShippedTreeRoot({
      [line]: {
        codingAgents: [...METHODOLOGY_CODING_AGENTS],
        sourceRecord: generatedSourceRecordWithPluginVersion(methodology.version as string),
      },
    }, async (treeRoot) => {
      const observed = await probeShippedTree(methodology, treeRoot);

      expect(observed.providerMatch).toBe(PROVIDER_MATCH.UNDECLARED);
      expect(observed.providerMismatch).toBeUndefined();
    });

    await withShippedTreeRoot({
      [line]: {
        codingAgents: [...METHODOLOGY_CODING_AGENTS],
        sourceRecord: generatedSourceRecordProviding(methodology.version as string),
      },
    }, async (treeRoot) => {
      const observed = await probeShippedTree(methodology, treeRoot);

      expect(observed.providerMatch).toBe(PROVIDER_MATCH.VERIFIED);
      expect(observed.providerMismatch).toBeUndefined();
    });
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
      [line]: {
        codingAgents: [...METHODOLOGY_CODING_AGENTS],
        sourceRecord: generatedSourceRecordProviding(otherVersion.text),
      },
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

  it("checks a declared migration source against every recorded supports form: an exact range, a comparator set, and alternatives each hold it, while a range above it and a comparator set closed below it report the mismatch naming both", async () => {
    const methodology = generatedMigratingMethodology();
    const line = lineOf(methodology);
    const version = methodology.version as string;
    const migratingFrom = methodology.migratingFrom as string;
    // Each form the module's grammar admits: one exact version, a comparator
    // set both of whose bounds must hold, and alternatives of which one must.
    const holding = [
      supportsRangeContaining(migratingFrom),
      supportsRangeSpanning(migratingFrom),
      supportsRangeAlternatives(migratingFrom),
    ];
    const excluding = [
      supportsRangeExcluding(migratingFrom),
      supportsRangeSpanningBelow(migratingFrom),
    ];

    for (const supports of holding) {
      await withShippedTreeRoot({
        [line]: {
          codingAgents: [...METHODOLOGY_CODING_AGENTS],
          sourceRecord: generatedSourceRecordProviding(version, supports),
        },
      }, async (treeRoot) => {
        const observed = await probeShippedTree(methodology, treeRoot);

        expect(observed.providerMatch, supports).toBe(PROVIDER_MATCH.VERIFIED);
        expect(observed.providerMismatch, supports).toBeUndefined();
      });
    }

    for (const supports of excluding) {
      await withShippedTreeRoot({
        [line]: {
          codingAgents: [...METHODOLOGY_CODING_AGENTS],
          sourceRecord: generatedSourceRecordProviding(version, supports),
        },
      }, async (treeRoot) => {
        const observed = await probeShippedTree(methodology, treeRoot);

        expect(observed.providerMatch, supports).toBeUndefined();
        expect(observed.providerMismatch, supports).toContain(migratingFrom);
        expect(observed.providerMismatch, supports).toContain(supports);
        expect(observed.providerMismatch, supports).not.toContain(version);
      });
    }
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
