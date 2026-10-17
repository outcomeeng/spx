import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

// The report never writes. Each case arranges state where a writing report would leave a trace: a
// checkout holding no state store, which a report that creates its directories would populate, a
// checkout whose store holds a started run, which a report that rewrites or removes entries would
// alter, and a store linked to another location, which a report that creates through the link would
// populate. The checkout's files and directories, with their content digests and modification times,
// are the oracle.
describe("verify write-path report is read-only", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))("verification type %s", (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "leaves a checkout without a state store unchanged for a %s-scope run",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const before = await repository.snapshotState();
          const reported = await repository.reportWritePaths(scopeType, verificationType);

          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(await repository.snapshotState()).toEqual(before);
        });
      },
    );

    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "leaves a checkout holding a started run unchanged for a %s-scope run",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const run = await repository.startRun(scopeType, verificationType);
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const before = await repository.snapshotState();
          const reported = await repository.reportWritePaths(scopeType, verificationType);

          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(await repository.snapshotState()).toEqual(before);
        });
      },
    );

    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "leaves a checkout whose state store is a link to another location unchanged for a %s-scope run",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          await repository.linkStateStore();
          const before = await repository.snapshotState();
          const reported = await repository.reportWritePaths(scopeType, verificationType);

          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(await repository.snapshotState()).toEqual(before);
        });
      },
    );
  });
});
