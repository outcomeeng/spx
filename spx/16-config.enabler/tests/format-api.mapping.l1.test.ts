import { describe, expect, it } from "vitest";

import { CONFIG_FILE_READ_KIND } from "@/config";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { forEachConfigFormatObservation } from "@testing/harnesses/config/resolution";

describe("config format API mapping", () => {
  it("maps every declared format to config-owned read, parse, and serialize behavior", async () => {
    await forEachConfigFormatObservation(({ expectedConfig, format, parsed, read, reparsed, serialized }) => {
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.value.kind).toBe(CONFIG_FILE_READ_KIND.OK);
      if (read.value.kind !== CONFIG_FILE_READ_KIND.OK) return;
      expect(read.value.file.format).toBe(format);
      expect(parsed).not.toBeNull();
      if (parsed === null) return;
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(specTreeConfigDescriptor.validate(parsed.value[specTreeConfigDescriptor.section])).toEqual(
        specTreeConfigDescriptor.validate(expectedConfig[specTreeConfigDescriptor.section]),
      );
      expect(serialized).not.toBeNull();
      expect(reparsed).not.toBeNull();
      if (serialized === null || reparsed === null) return;
      expect(serialized.ok).toBe(true);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) expect(reparsed.value).toEqual(parsed.value);
    });
  });
});
