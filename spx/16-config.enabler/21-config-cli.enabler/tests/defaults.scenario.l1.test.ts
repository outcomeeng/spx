import { describe, expect, it } from "vitest";

import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  withDefaultsFormatEquivalenceObservation,
  withDefaultsIndependenceObservation,
  withDefaultsJsonObservation,
  withDefaultsOutputObservation,
  withDefaultsRegistryObservation,
} from "@testing/harnesses/config/cli";

describe("defaultsCommand — default-format output", () => {
  it("emits a default-format dump of every registered descriptor's defaults, exit 0", async () => {
    await withDefaultsOutputObservation(({ defaultParsed, generatedDefaults, generatedSection, result }) => {
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(defaultParsed.ok).toBe(true);
      if (!defaultParsed.ok) return;
      expect(defaultParsed.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      expect(defaultParsed.value[generatedSection]).toEqual(generatedDefaults);
    });
  });

  it("does not call resolveConfig — output is independent of any product config file present at the product directory", async () => {
    await withDefaultsIndependenceObservation(({ defaultParsed, result }) => {
      expect(result.exitCode).toBe(0);
      expect(defaultParsed.ok).toBe(true);
      if (defaultParsed.ok) {
        expect(defaultParsed.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });
});

describe("defaultsCommand — JSON output", () => {
  it("emits descriptor defaults as a JSON document when --json is set, exit 0", async () => {
    await withDefaultsJsonObservation(({ generatedDefaults, generatedSection, jsonParsed, result }) => {
      expect(result.exitCode).toBe(0);
      expect(jsonParsed.ok).toBe(true);
      if (!jsonParsed.ok) return;
      expect(jsonParsed.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      expect(jsonParsed.value[generatedSection]).toEqual(generatedDefaults);
    });
  });

  it("JSON and default-format encodings round-trip to equal Configs", async () => {
    await withDefaultsFormatEquivalenceObservation(({ defaultParsed, jsonParsed }) => {
      expect(defaultParsed.ok).toBe(true);
      expect(jsonParsed.ok).toBe(true);
      if (defaultParsed.ok && jsonParsed.ok) {
        expect(defaultParsed.value).toEqual(jsonParsed.value);
      }
    });
  });
});

describe("defaultsCommand — registry iteration", () => {
  it("emits one section per descriptor in the supplied list — no more, no fewer", async () => {
    await withDefaultsRegistryObservation(({ defaultParsed, generatedSection }) => {
      expect(defaultParsed.ok).toBe(true);
      if (defaultParsed.ok) {
        expect(Object.keys(defaultParsed.value).sort(compareAsciiStrings)).toEqual(
          [generatedSection, specTreeConfigDescriptor.section].sort(compareAsciiStrings),
        );
      }
    });
  });
});
