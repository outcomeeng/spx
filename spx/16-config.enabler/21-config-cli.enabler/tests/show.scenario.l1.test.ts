import { describe, expect, it } from "vitest";

import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  withShowDefaultConfigObservation,
  withShowFormatEquivalenceObservation,
  withShowJsonConfigObservation,
  withShowOverrideObservation,
  withShowResolutionFailureObservation,
} from "@testing/harnesses/config/cli";

describe("showCommand", () => {
  it("emits a default-format dump of the resolved Config when no overrides apply", async () => {
    await withShowDefaultConfigObservation(({ config, defaultParsed, result }) => {
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(defaultParsed.ok).toBe(true);
      if (defaultParsed.ok) expect(defaultParsed.value).toEqual(config);
    });
  });

  it("reflects config-driven overrides in the emitted default format", async () => {
    await withShowOverrideObservation(({ config, defaultParsed, result }) => {
      expect(result.exitCode).toBe(0);
      expect(defaultParsed.ok).toBe(true);
      if (!defaultParsed.ok) return;
      const actual = specTreeConfigDescriptor.validate(defaultParsed.value[specTreeConfigDescriptor.section]);
      const expected = specTreeConfigDescriptor.validate(config[specTreeConfigDescriptor.section]);
      expect(actual.ok).toBe(true);
      expect(expected.ok).toBe(true);
      if (actual.ok && expected.ok) {
        expect(Object.keys(actual.value.kinds).sort(compareAsciiStrings)).toEqual(
          Object.keys(expected.value.kinds).sort(compareAsciiStrings),
        );
      }
    });
  });

  it("emits a JSON document when --json is set", async () => {
    await withShowJsonConfigObservation(({ config, jsonParsed, result }) => {
      expect(result.exitCode).toBe(0);
      expect(jsonParsed.ok).toBe(true);
      if (jsonParsed.ok) expect(jsonParsed.value).toEqual(config);
    });
  });

  it("emits equivalent JSON and default-format encodings", async () => {
    await withShowFormatEquivalenceObservation(({ defaultParsed, jsonParsed }) => {
      expect(defaultParsed.ok).toBe(true);
      expect(jsonParsed.ok).toBe(true);
      if (defaultParsed.ok && jsonParsed.ok) {
        expect(defaultParsed.value).toEqual(jsonParsed.value);
      }
    });
  });

  it("surfaces a resolveConfig error with a descriptor-qualified diagnostic", async () => {
    await withShowResolutionFailureObservation(({ result }) => {
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(specTreeConfigDescriptor.section);
    });
  });
});
