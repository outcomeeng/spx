import * as fc from "fast-check";
import { expect } from "vitest";

import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "@/lib/precommit/entrypoint";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

const precommitEntrypoints = Object.values(PRECOMMIT_ENTRYPOINT);

export function assertPrecommitEntrypointsRecognizeDirectExecution(): void {
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
}

export function assertPrecommitEntrypointsRejectMismatchedArgv(): void {
  fc.assert(
    fc.property(
      PRECOMMIT_TEST_GENERATOR.posixDirectoryPrefix(),
      PRECOMMIT_TEST_GENERATOR.pathSegment(),
      (posixPrefix, suffix) => {
        const gateImportMetaUrl = `file://${posixPrefix}${PRECOMMIT_ENTRYPOINT.MAIN_CHECKOUT_GATE.sourceSuffix}`;
        const installArgvPath = `${posixPrefix}/${PRECOMMIT_ENTRYPOINT.INSTALL_HOOKS.argvFragment}.ts`;
        const installExtraArgvPath = `${posixPrefix}/${PRECOMMIT_ENTRYPOINT.INSTALL_HOOKS.argvFragment}-${suffix}.ts`;

        expect(
          isDirectPrecommitEntrypoint(
            gateImportMetaUrl,
            installArgvPath,
            PRECOMMIT_ENTRYPOINT.MAIN_CHECKOUT_GATE,
          ),
        ).toBe(false);
        expect(
          isDirectPrecommitEntrypoint(
            `file://${posixPrefix}${PRECOMMIT_ENTRYPOINT.INSTALL_HOOKS.sourceSuffix}`,
            installExtraArgvPath,
            PRECOMMIT_ENTRYPOINT.INSTALL_HOOKS,
          ),
        ).toBe(false);
      },
    ),
  );
}
