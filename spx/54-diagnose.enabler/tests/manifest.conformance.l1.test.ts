import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { CHECK_NAME, type CheckName, MANIFEST_FIELDS, parseManifest } from "@/domains/diagnose/manifest";
import {
  arbitraryCheckName,
  arbitraryManifestFacts,
  manifestJson,
  marketplaceIdentityJson,
} from "@testing/generators/diagnose/manifest";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

const allChecks = (): readonly CheckName[] => Object.values(CHECK_NAME);
const parseAgainstAllChecks = (rawJson: string) => parseManifest(rawJson, allChecks());
const isKnownCheckName = (name: string): boolean => (allChecks() as readonly string[]).includes(name);

describe("a manifest parses to the typed contract carrying the floor, marketplace, expected plugins, and check set", () => {
  it("parses a complete manifest and round-trips the facts each selected check requires", () => {
    assertProperty(arbitraryManifestFacts(), (facts) => {
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

      if (facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
        expect(result.value.methodology).toEqual({
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
        });
      } else {
        expect(result.value.methodology).toBeUndefined();
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });
});

describe("a manifest that selects a check without that check's required consumer facts is rejected", () => {
  it("rejects a manifest selecting spx-reachability with no spx-version floor", () => {
    const result = parseAgainstAllChecks(JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a manifest selecting marketplace-install with no marketplace or expected plugins", () => {
    const result = parseAgainstAllChecks(
      JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a manifest selecting marketplace-install with an empty expected plugin set", () => {
    assertProperty(arbitraryManifestFacts(), (facts) => {
      const result = parseAgainstAllChecks(
        JSON.stringify({
          [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
          [MANIFEST_FIELDS.MARKETPLACE]: marketplaceIdentityJson(facts.marketplaceName, facts.marketplaceSource),
          [MANIFEST_FIELDS.EXPECTED_PLUGINS]: [],
        }),
      );
      expect(result.ok).toBe(false);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("rejects a manifest selecting methodology-context with no methodology facts", () => {
    const result = parseAgainstAllChecks(
      JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a manifest selecting methodology-context with malformed methodology facts", () => {
    assertProperty(arbitraryManifestFacts(), (facts) => {
      const result = parseAgainstAllChecks(
        JSON.stringify({
          [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
          [MANIFEST_FIELDS.METHODOLOGY]: {
            [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
            [METHODOLOGY_CONFIG_FIELDS.VERSION]: "",
          },
        }),
      );
      expect(result.ok).toBe(false);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("rejects a manifest selecting methodology-context with incomplete methodology facts", () => {
    assertProperty(arbitraryManifestFacts(), (facts) => {
      const result = parseAgainstAllChecks(
        JSON.stringify({
          [MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
          [MANIFEST_FIELDS.METHODOLOGY]: {
            [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
          },
        }),
      );
      expect(result.ok).toBe(false);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("ignores malformed methodology facts when methodology-context is not selected", () => {
    assertProperty(arbitraryManifestFacts(), (facts) => {
      const checks = facts.checks.filter((check) => check !== CHECK_NAME.METHODOLOGY_CONTEXT);
      fc.pre(checks.length > 0);
      const body = JSON.parse(manifestJson({ ...facts, checks })) as Record<string, unknown>;
      body[MANIFEST_FIELDS.METHODOLOGY] = {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: "",
      };
      const result = parseAgainstAllChecks(JSON.stringify(body));
      expect(result.ok).toBe(true);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("rejects a manifest naming an unknown check", () => {
    assertProperty(
      fc.tuple(fc.string({ minLength: 1 }).filter((name) => !isKnownCheckName(name)), arbitraryCheckName()),
      ([unknownName, knownName]) => {
        const result = parseAgainstAllChecks(
          JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [knownName, unknownName] }),
        );
        expect(result.ok).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a manifest naming a known check that is not available in this build", () => {
    assertProperty(fc.tuple(arbitraryCheckName(), arbitraryCheckName()), ([available, requested]) => {
      fc.pre(available !== requested);
      const result = parseManifest(JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [requested] }), [available]);
      expect(result.ok).toBe(false);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("rejects a manifest whose check set is empty or absent", () => {
    expect(parseAgainstAllChecks(JSON.stringify({ [MANIFEST_FIELDS.CHECKS]: [] })).ok).toBe(false);
    expect(parseAgainstAllChecks(JSON.stringify({})).ok).toBe(false);
  });

  it("rejects input that is not a JSON object", () => {
    const nonObjectJson = [JSON.stringify([CHECK_NAME.SPX_REACHABILITY] satisfies CheckName[]), "{ not json"];
    for (const input of nonObjectJson) {
      expect(parseAgainstAllChecks(input).ok).toBe(false);
    }
  });
});
