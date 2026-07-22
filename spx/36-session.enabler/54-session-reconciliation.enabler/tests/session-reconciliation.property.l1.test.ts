import { describe, expect, it } from "vitest";

import { reconcileCommand } from "@/commands/session/reconcile";
import { reconcileReferences } from "@/domains/session/reconcile";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  arbitraryReconcileStoreScenario,
  arbitraryReconcileTotalityScenario,
} from "@testing/generators/session/reconcile";
import { arbitrarySessionId } from "@testing/generators/session/session";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  createFatalGitDeps,
  createReconcileDeps,
  snapshotDirectory,
  withReconcileStore,
} from "@testing/harnesses/session/reconcile";

const [TODO] = SESSION_STATUSES;

describe("session-reconciliation totality", () => {
  it("emits exactly one verdict per recorded reference", () => {
    assertProperty(
      arbitraryReconcileTotalityScenario(),
      ({ metadata, probes }) => {
        const findings = reconcileReferences(metadata, probes);
        const recordedReferenceCount = (metadata.git_ref === "" ? 0 : 1)
          + metadata.specs.length
          + metadata.files.length;
        return findings.length === recordedReferenceCount;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("session-reconciliation non-mutation", () => {
  it("leaves the session store and the working directory byte-identical", async () => {
    await assertProperty(
      arbitraryReconcileStoreScenario(),
      async (scenario) => {
        await withReconcileStore(async ({ harness, cwd }) => {
          const sessionId = sampleLiteralTestValue(arbitrarySessionId());
          await harness.writeSession(TODO, sessionId, {
            git_ref: scenario.gitRef,
            specs: scenario.specs,
            files: scenario.files,
          });

          const storeBefore = await snapshotDirectory(harness.sessionsDir);
          const cwdBefore = await snapshotDirectory(cwd);

          await reconcileCommand({
            sessionId,
            sessionsDir: harness.sessionsDir,
            cwd,
            deps: createReconcileDeps(createFatalGitDeps()),
          });

          expect(await snapshotDirectory(harness.sessionsDir)).toStrictEqual(storeBefore);
          expect(await snapshotDirectory(cwd)).toStrictEqual(cwdBefore);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
