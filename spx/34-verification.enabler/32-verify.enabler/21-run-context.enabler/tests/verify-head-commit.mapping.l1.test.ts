import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_CONTEXT_EVENT_FIELD, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// The repository's checkout is detached at the base commit while its changeset ranges end at a branch
// naming the head commit. A changeset run judges the commit its range head names; every other scope
// judges the checkout's HEAD when `start` runs.
describe("verify start head commit", () => {
  it.each(Object.values(VERIFY_SCOPE_TYPE))(
    "records on the run-context event the commit the %s scope judges",
    async (scopeType) => {
      await withVerifyHeadCommitRepository(async (repository) => {
        await repository.startRun(scopeType).then((run) => {
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(run.runContextData).toHaveLength(1);
          expect(run.runContextData[0]?.[VERIFY_RUN_CONTEXT_EVENT_FIELD.HEAD_COMMIT]).toBe(
            scopeType === VERIFY_SCOPE_TYPE.CHANGESET ? repository.headCommit : repository.baseCommit,
          );
        });
      });
    },
  );
});
