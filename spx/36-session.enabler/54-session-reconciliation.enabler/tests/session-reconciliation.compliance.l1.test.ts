import { describe, expect, it } from "vitest";

import { reconcileCommand } from "@/commands/session/reconcile";
import { RECONCILE_REFERENCE_KIND, RECONCILE_VERDICT, type ReconcileFinding } from "@/domains/session/reconcile";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { arbitraryReconcileBranchName, arbitraryReconcileEntryPath } from "@testing/generators/session/reconcile";
import { arbitrarySessionId } from "@testing/generators/session/session";
import { createFatalGitDeps, createReconcileDeps, withReconcileStore } from "@testing/harnesses/session/reconcile";

const [TODO] = SESSION_STATUSES;

describe("session-reconciliation verdict distinguishability", () => {
  it("keeps an unverifiable verdict distinguishable from a discrepancy verdict in one emitted result", async () => {
    await withReconcileStore(async ({ harness, cwd }) => {
      const branch = sampleLiteralTestValue(arbitraryReconcileBranchName());
      const absentPath = sampleLiteralTestValue(arbitraryReconcileEntryPath());
      const sessionId = sampleLiteralTestValue(arbitrarySessionId());

      // One session whose git_ref lookup git cannot answer and whose one
      // recorded entry is absent on disk — the two failure verdicts side by side.
      await harness.writeSession(TODO, sessionId, {
        git_ref: branch,
        specs: [absentPath],
        files: [],
      });

      const findings = JSON.parse(
        await reconcileCommand({
          sessionId,
          sessionsDir: harness.sessionsDir,
          cwd,
          deps: createReconcileDeps(createFatalGitDeps()),
        }),
      ) as ReconcileFinding[];

      const gitFinding = findings.find((finding) => finding.kind === RECONCILE_REFERENCE_KIND.GIT_REF);
      const entryFinding = findings.find((finding) => finding.kind === RECONCILE_REFERENCE_KIND.SPEC);

      expect(gitFinding?.verdict).toBe(RECONCILE_VERDICT.UNVERIFIABLE);
      expect(entryFinding?.verdict).toBe(RECONCILE_VERDICT.DISCREPANCY);
      expect(gitFinding?.verdict).not.toBe(entryFinding?.verdict);
    });
  });
});
