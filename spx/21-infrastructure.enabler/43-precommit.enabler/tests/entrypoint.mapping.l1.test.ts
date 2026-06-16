import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "@/lib/precommit/entrypoint";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

const precommitEntrypoints = Object.values(PRECOMMIT_ENTRYPOINT);

describe("isDirectPrecommitEntrypoint", () => {
  it("maps POSIX and Windows argv paths for the invoked precommit script to direct execution", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.posixDirectoryPrefix(),
        PRECOMMIT_TEST_GENERATOR.windowsDirectoryPrefix(),
        (posixPrefix, windowsPrefix) => {
          for (const entrypoint of precommitEntrypoints) {
            const importMetaUrl = `file://${posixPrefix}${entrypoint.sourceSuffix}`;
            const posixArgvPath = `${posixPrefix}/${entrypoint.argvFragment}.ts`;
            const windowsArgvFragment = entrypoint.argvFragment.replaceAll("/", "\\");
            const windowsArgvPath = `${windowsPrefix}\\${windowsArgvFragment}.ts`;

            expect(isDirectPrecommitEntrypoint(importMetaUrl, posixArgvPath, entrypoint)).toBe(true);
            expect(isDirectPrecommitEntrypoint(importMetaUrl, windowsArgvPath, entrypoint)).toBe(true);
          }
        },
      ),
    );
  });

  it("maps a mismatched argv path to not-direct execution", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.posixDirectoryPrefix(),
        PRECOMMIT_TEST_GENERATOR.pathSegment(),
        (posixPrefix, suffix) => {
          const runImportMetaUrl = `file://${posixPrefix}${PRECOMMIT_ENTRYPOINT.RUN.sourceSuffix}`;
          const gateImportMetaUrl = `file://${posixPrefix}${PRECOMMIT_ENTRYPOINT.MAIN_CHECKOUT_GATE.sourceSuffix}`;
          const runArgvPath = `${posixPrefix}/${PRECOMMIT_ENTRYPOINT.RUN.argvFragment}.ts`;
          const runExtraArgvPath = `${posixPrefix}/${PRECOMMIT_ENTRYPOINT.RUN.argvFragment}-${suffix}.ts`;

          expect(
            isDirectPrecommitEntrypoint(
              gateImportMetaUrl,
              runArgvPath,
              PRECOMMIT_ENTRYPOINT.MAIN_CHECKOUT_GATE,
            ),
          ).toBe(false);
          expect(isDirectPrecommitEntrypoint(runImportMetaUrl, runExtraArgvPath, PRECOMMIT_ENTRYPOINT.RUN)).toBe(false);
        },
      ),
    );
  });
});
