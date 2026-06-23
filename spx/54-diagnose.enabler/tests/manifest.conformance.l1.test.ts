import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CHECK_NAME, type CheckName, parseManifest } from "@/domains/diagnose/manifest";
import { arbitraryCheckName, arbitraryManifestFacts, manifestJson } from "@testing/generators/diagnose/manifest";

const allChecks = (): readonly CheckName[] => Object.values(CHECK_NAME);
const parseAgainstAllChecks = (rawJson: string) => parseManifest(rawJson, allChecks());
const isKnownCheckName = (name: string): boolean => (allChecks() as readonly string[]).includes(name);

describe("a manifest parses to the typed contract carrying the floor, marketplace, expected plugins, and check set", () => {
  it("parses a complete manifest and round-trips the facts each selected check requires", () => {
    fc.assert(
      fc.property(arbitraryManifestFacts(), (facts) => {
        const result = parseAgainstAllChecks(manifestJson(facts));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.checks).toEqual(facts.checks);

        if (facts.checks.includes(CHECK_NAME.SPX_REACHABILITY)) {
          expect(result.value.spxFloor).toBe(facts.spxFloor);
        } else {
          expect(result.value.spxFloor).toBeUndefined();
        }

        if (facts.checks.includes(CHECK_NAME.MARKETPLACE_INSTALL)) {
          expect(result.value.marketplace).toEqual({ name: facts.marketplaceName, source: facts.marketplaceSource });
          expect(result.value.expectedPlugins).toEqual(facts.expectedPlugins);
        } else {
          expect(result.value.marketplace).toBeUndefined();
          expect(result.value.expectedPlugins).toBeUndefined();
        }
      }),
    );
  });
});

describe("a manifest that selects a check without that check's required consumer facts is rejected", () => {
  it("rejects a manifest selecting spx-reachability with no spx_floor", () => {
    const result = parseAgainstAllChecks(JSON.stringify({ checks: [CHECK_NAME.SPX_REACHABILITY] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a manifest selecting marketplace-install with no marketplace or expected plugins", () => {
    const result = parseAgainstAllChecks(JSON.stringify({ checks: [CHECK_NAME.MARKETPLACE_INSTALL] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a manifest selecting marketplace-install with an empty expected_plugins array", () => {
    fc.assert(
      fc.property(arbitraryManifestFacts(), (facts) => {
        const result = parseAgainstAllChecks(
          JSON.stringify({
            checks: [CHECK_NAME.MARKETPLACE_INSTALL],
            marketplace: { name: facts.marketplaceName, source: facts.marketplaceSource },
            expected_plugins: [],
          }),
        );
        expect(result.ok).toBe(false);
      }),
    );
  });

  it("rejects a manifest naming an unknown check", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((name) => !isKnownCheckName(name)),
        arbitraryCheckName(),
        (unknownName, knownName) => {
          const result = parseAgainstAllChecks(JSON.stringify({ checks: [knownName, unknownName] }));
          expect(result.ok).toBe(false);
        },
      ),
    );
  });

  it("rejects a manifest naming a known check that is not available in this build", () => {
    fc.assert(
      fc.property(arbitraryCheckName(), arbitraryCheckName(), (available, requested) => {
        fc.pre(available !== requested);
        const result = parseManifest(JSON.stringify({ checks: [requested] }), [available]);
        expect(result.ok).toBe(false);
      }),
    );
  });

  it("rejects a manifest whose check set is empty or absent", () => {
    expect(parseAgainstAllChecks(JSON.stringify({ checks: [] })).ok).toBe(false);
    expect(parseAgainstAllChecks(JSON.stringify({})).ok).toBe(false);
  });

  it("rejects input that is not a JSON object", () => {
    const nonObjectJson = [JSON.stringify([CHECK_NAME.SPX_REACHABILITY] satisfies CheckName[]), "{ not json"];
    for (const input of nonObjectJson) {
      expect(parseAgainstAllChecks(input).ok).toBe(false);
    }
  });
});
