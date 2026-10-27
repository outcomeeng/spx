/**
 * Run-root scenario over the built `spx` executable: a runner process of `spx test` inherits the one run
 * root the invocation owns, a child process of that runner creates its directory inside the root, and the
 * root and the user temp folder hold nothing once the command exits.
 */

import { basename, join, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { worktreeScopeDir } from "@/lib/state-store";
import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { runSpxTestWithRunRootObserver, SPX_TEST_RUN_MODE } from "@testing/harnesses/temp-directory/spx-test-run";

describe("spx test run with a runner process that requests a temp directory", () => {
  it.each(Object.values(SPX_TEST_RUN_MODE))(
    "keeps every created directory under the invocation's one run root and removes the root at exit in %s mode",
    async (mode) => {
      const run = await runSpxTestWithRunRootObserver(mode);
      const { observed } = run;
      const rootName = basename(observed.inheritedRoot ?? "");

      expect(run.exitCode).toBe(0);

      expect(observed.inheritedRoot).toBeDefined();
      expect(observed.inheritedRootParent).toBe(
        join(worktreeScopeDir(run.worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR),
      );
      expect(rootName.startsWith(TEMP_DIRECTORY_PATH.RUN_ROOT_PREFIX)).toBe(true);
      expect(observed.runRootsListing).toEqual([rootName]);

      expect(observed.child.root).toBe(observed.inheritedRoot);
      expect(observed.child.directory.startsWith(`${observed.inheritedRoot}${sep}`)).toBe(true);
      expect(observed.child.rootExistedWhileRunning).toBe(true);
      expect(observed.child.contentExistedWhileRunning).toBe(true);

      expect(run.rootExistsAfterExit).toBe(false);
      expect(run.runRootsAfterExit).toEqual([]);
      expect(run.userTempEntriesAfterExit).toEqual([]);
    },
    CLI_TIMEOUTS_MS.E2E_LONG_BATCH,
  );
});
