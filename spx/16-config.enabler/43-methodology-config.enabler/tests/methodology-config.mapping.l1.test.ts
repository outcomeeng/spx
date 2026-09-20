import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION, METHODOLOGY_VERSION_FORM, requireMethodologyVersion } from "@/config/methodology";
import { methodologyLine } from "@/lib/methodology";
import {
  observeMethodologyConfigFormatsResolveEquivalently,
  observeMethodologyVersionFormsResolution,
} from "@testing/harnesses/config/methodology";

describe("methodology config mappings", () => {
  it("resolves equivalent methodology config across supported file formats", () => {
    const observation = observeMethodologyConfigFormatsResolveEquivalently();
    expect(observation.expected.ok).toBe(true);
    if (!observation.expected.ok) throw new Error(observation.expected.error);
    for (const format of observation.formats) {
      expect(format.serialized.ok).toBe(true);
      expect(format.parsed?.ok).toBe(true);
      if (format.parsed?.ok === true) {
        expect(format.parsed.value[METHODOLOGY_SECTION]).toEqual(observation.expected.value);
      }
    }
  });

  it("resolves each accepted form of methodology.version to the same MAJOR.MINOR line", async () => {
    const observation = await observeMethodologyVersionFormsResolution();
    expect(new Set(observation.forms.map((entry) => entry.form))).toEqual(
      new Set(Object.values(METHODOLOGY_VERSION_FORM)),
    );
    for (const entry of observation.forms) {
      expect(entry.result.ok).toBe(true);
      if (!entry.result.ok) throw new Error(entry.result.error);
      const resolved = requireMethodologyVersion(entry.result.value);
      expect(resolved).toEqual({ ok: true, value: entry.declared });
      if (!resolved.ok) throw new Error(resolved.error);
      expect(methodologyLine(resolved.value)).toEqual({ ok: true, value: observation.line });
    }
  });
});
