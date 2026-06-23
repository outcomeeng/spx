import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DiagnoseConfig } from "@/domains/diagnose/config";
import { CHECK_NAME, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import { resolveDiagnoseFacts } from "@/domains/diagnose/resolve";
import {
  arbitraryMarketplaceSource,
  arbitraryNameToken,
  arbitrarySpxFloor,
} from "@testing/generators/diagnose/manifest";

const availableChecks = Object.values(CHECK_NAME);

describe("diagnostic fact resolution follows the precedence manifest over config over safe defaults", () => {
  it("returns the manifest unchanged when one is supplied, ignoring config", () => {
    fc.assert(
      fc.property(arbitrarySpxFloor(), arbitrarySpxFloor(), (manifestFloor, configFloor) => {
        const manifest: DiagnoseManifest = { checks: [CHECK_NAME.SPX_REACHABILITY], spxFloor: manifestFloor };
        const config: DiagnoseConfig = { spxFloor: configFloor, checks: [CHECK_NAME.SESSION_STORE] };

        const result = resolveDiagnoseFacts({ manifest, config, availableChecks });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toBe(manifest);
      }),
    );
  });

  it("resolves the check set and facts from config when no manifest is supplied", () => {
    fc.assert(
      fc.property(
        arbitrarySpxFloor(),
        arbitraryNameToken(),
        arbitraryMarketplaceSource(),
        arbitraryNameToken(),
        (spxFloor, marketplaceName, marketplaceSource, plugin) => {
          const config: DiagnoseConfig = {
            spxFloor,
            marketplace: { name: marketplaceName, source: marketplaceSource },
            expectedPlugins: [plugin],
            checks: [CHECK_NAME.SPX_REACHABILITY, CHECK_NAME.MARKETPLACE_INSTALL],
          };

          const result = resolveDiagnoseFacts({ config, availableChecks });

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.checks).toEqual([CHECK_NAME.SPX_REACHABILITY, CHECK_NAME.MARKETPLACE_INSTALL]);
            expect(result.value.spxFloor).toBe(spxFloor);
            expect(result.value.marketplace).toEqual({ name: marketplaceName, source: marketplaceSource });
            expect(result.value.expectedPlugins).toEqual([plugin]);
          }
        },
      ),
    );
  });

  it("defaults the check set to every available check when config names none", () => {
    const result = resolveDiagnoseFacts({ config: {}, availableChecks });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks).toEqual(availableChecks);
      expect(result.value.spxFloor).toBeUndefined();
      expect(result.value.marketplace).toBeUndefined();
      expect(result.value.expectedPlugins).toBeUndefined();
    }
  });

  it("rejects a config check absent from the available set", () => {
    fc.assert(
      fc.property(arbitraryNameToken(), (unknownCheck) => {
        fc.pre(!availableChecks.includes(unknownCheck as (typeof availableChecks)[number]));
        const config: DiagnoseConfig = { checks: [unknownCheck] };

        const result = resolveDiagnoseFacts({ config, availableChecks });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(unknownCheck);
      }),
    );
  });
});
