import { describe, expect, it } from "vitest";

import { diagnoseConfigDescriptor } from "@/domains/diagnose/config";
import { CHECK_NAME } from "@/domains/diagnose/manifest";

export function registerDiagnoseConfigMappings(): void {
  describe("the diagnose config descriptor validates its section, rejecting empty arrays like the manifest path", () => {
    it("rejects an empty `checks` array — parity with the manifest's non-empty check-set contract", () => {
      const result = diagnoseConfigDescriptor.validate({ checks: [] });

      expect(result.ok).toBe(false);
    });

    it("rejects an empty `expectedPlugins` array", () => {
      const result = diagnoseConfigDescriptor.validate({ expectedPlugins: [] });

      expect(result.ok).toBe(false);
    });

    it("resolves a populated section to the typed facts", () => {
      const result = diagnoseConfigDescriptor.validate({
        checks: [CHECK_NAME.SPX_REACHABILITY],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      }
    });

    it("resolves an absent section to empty defaults", () => {
      const result = diagnoseConfigDescriptor.validate({});

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({});
    });
  });
}
