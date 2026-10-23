/**
 * A child that exits 3 is a completed run, distinct from the wait cap's not_ready exit 3.
 */

import { describe, expect, it } from "vitest";

import { RESULT_SCHEMA, RESULT_STATUS } from "@/lib/host-command-lock";
import { exitingWorkload, startSupervisor, withLockEnv } from "@testing/harnesses/host-command-lock/host-command-lock";

describe("terminal result of a child that exits 3", () => {
  it("reports started true, status completed, childExitCode 3, and exits 3", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: exitingWorkload(3) });

      const exit = await supervisor.exit;

      expect(exit.code).toBe(3);
      expect(supervisor.resultLine()).toMatchObject({
        schema: RESULT_SCHEMA,
        started: true,
        status: RESULT_STATUS.COMPLETED,
        childExitCode: 3,
      });
    });
  });
});
