import { expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import {
  REAL_RUN_FIXTURE,
  recordSealedTestJournal,
  runRealVitestOver,
  withJournaledNode,
  writeRealRunSuites,
} from "@testing/harnesses/testing/status-journal";

it("resolves both modules of a real run as not-run when one module fails to load and another passes", async () => {
  await withJournaledNode(async ({ repository, resolvers }) => {
    const [unloadable, loadable] = repository.testPaths;
    const { productDir } = repository.env;
    await writeRealRunSuites(
      productDir,
      new Map([[unloadable, REAL_RUN_FIXTURE.IMPORTS_MISSING_FILE], [loadable, REAL_RUN_FIXTURE.PASSING]]),
    );
    const headCommit = await repository.commitAll();

    const run = await runRealVitestOver(productDir, [unloadable, loadable]);
    await recordSealedTestJournal(productDir, { ...run, headCommit, at: new Date() });
    const outcomes = await resolvers.resolveOutcome(repository.nodeId, [unloadable, loadable]);

    expect(run.terminalStatus).not.toBe(JOURNAL_RUN_STATE_STATUS.PASSED);
    expect(run.findings).toEqual([]);
    expect(run.scopes).toHaveLength(2);
    expect(outcomes[unloadable]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    expect(outcomes[loadable]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
  });
});
