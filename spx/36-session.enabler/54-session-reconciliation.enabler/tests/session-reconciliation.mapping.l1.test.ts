import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { reconcileCommand } from "@/commands/session/reconcile";
import { RECONCILE_REFERENCE_KIND, RECONCILE_VERDICT, type ReconcileFinding } from "@/domains/session/reconcile";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  arbitraryDistinctReconcileEntryPaths,
  arbitraryReconcileBranchName,
} from "@testing/generators/session/reconcile";
import { arbitrarySessionId } from "@testing/generators/session/session";
import { createSessionGitDeps, createSessionHarness } from "@testing/harnesses/session/harness";
import {
  createFatalGitDeps,
  createReconcileDeps,
  createUnreadableEntryReconcileDeps,
} from "@testing/harnesses/session/reconcile";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const [TODO] = SESSION_STATUSES;

describe("session-reconciliation git_ref mapping", () => {
  it("maps each recorded git_ref state to its verdict", async () => {
    const harness = await createSessionHarness();
    const cwd = await createTempDir("spx-reconcile-gitref-");
    try {
      const branch = sampleLiteralTestValue(arbitraryReconcileBranchName());
      const sessionId = sampleLiteralTestValue(arbitrarySessionId());
      await harness.writeSession(TODO, sessionId, { git_ref: branch, specs: [], files: [] });

      // An exact origin remote-tracking branch maps to confirmed.
      const presentFindings = JSON.parse(
        await reconcileCommand({
          sessionId,
          sessionsDir: harness.sessionsDir,
          cwd,
          deps: createReconcileDeps(createSessionGitDeps({ originWorkBranches: [branch] })),
        }),
      ) as ReconcileFinding[];
      expect(presentFindings).toHaveLength(1);
      expect(presentFindings[0].kind).toBe(RECONCILE_REFERENCE_KIND.GIT_REF);
      expect(presentFindings[0].reference).toBe(branch);
      expect(presentFindings[0].verdict).toBe(RECONCILE_VERDICT.CONFIRMED);

      // A ref absent from origin maps to discrepancy.
      const absentFindings = JSON.parse(
        await reconcileCommand({
          sessionId,
          sessionsDir: harness.sessionsDir,
          cwd,
          deps: createReconcileDeps(createSessionGitDeps({ originWorkBranches: [] })),
        }),
      ) as ReconcileFinding[];
      expect(absentFindings).toHaveLength(1);
      expect(absentFindings[0].verdict).toBe(RECONCILE_VERDICT.DISCREPANCY);

      // A ref whose lookup git cannot answer maps to unverifiable.
      const fatalFindings = JSON.parse(
        await reconcileCommand({
          sessionId,
          sessionsDir: harness.sessionsDir,
          cwd,
          deps: createReconcileDeps(createFatalGitDeps()),
        }),
      ) as ReconcileFinding[];
      expect(fatalFindings).toHaveLength(1);
      expect(fatalFindings[0].verdict).toBe(RECONCILE_VERDICT.UNVERIFIABLE);
    } finally {
      await removeTempDir(cwd);
      await harness.cleanup();
    }
  });
});

describe("session-reconciliation entry mapping", () => {
  it("maps each recorded specs and files entry state to its verdict", async () => {
    const harness = await createSessionHarness();
    const cwd = await createTempDir("spx-reconcile-entries-");
    try {
      const [readablePath, absentPath, directoryPath, unreadablePath] = sampleLiteralTestValue(
        arbitraryDistinctReconcileEntryPaths(4),
      );
      const sessionId = sampleLiteralTestValue(arbitrarySessionId());

      await mkdir(dirname(join(cwd, readablePath)), { recursive: true });
      await writeFile(join(cwd, readablePath), `content of ${readablePath}`);
      await mkdir(join(cwd, directoryPath), { recursive: true });

      await harness.writeSession(TODO, sessionId, {
        git_ref: "",
        specs: [readablePath, absentPath],
        files: [directoryPath, unreadablePath],
      });

      const findings = JSON.parse(
        await reconcileCommand({
          sessionId,
          sessionsDir: harness.sessionsDir,
          cwd,
          deps: createUnreadableEntryReconcileDeps(createFatalGitDeps(), cwd, unreadablePath),
        }),
      ) as ReconcileFinding[];

      // A path readable as a file maps to confirmed.
      expect(findings[0].kind).toBe(RECONCILE_REFERENCE_KIND.SPEC);
      expect(findings[0].reference).toBe(readablePath);
      expect(findings[0].verdict).toBe(RECONCILE_VERDICT.CONFIRMED);

      // An absent path maps to discrepancy.
      expect(findings[1].reference).toBe(absentPath);
      expect(findings[1].verdict).toBe(RECONCILE_VERDICT.DISCREPANCY);

      // A path resolving to a directory maps to discrepancy.
      expect(findings[2].kind).toBe(RECONCILE_REFERENCE_KIND.FILE);
      expect(findings[2].reference).toBe(directoryPath);
      expect(findings[2].verdict).toBe(RECONCILE_VERDICT.DISCREPANCY);

      // A path whose read fails for any other reason maps to unverifiable.
      expect(findings[3].reference).toBe(unreadablePath);
      expect(findings[3].verdict).toBe(RECONCILE_VERDICT.UNVERIFIABLE);

      // The empty recorded git_ref contributes no finding.
      expect(findings).toHaveLength(4);
    } finally {
      await removeTempDir(cwd);
      await harness.cleanup();
    }
  });
});
