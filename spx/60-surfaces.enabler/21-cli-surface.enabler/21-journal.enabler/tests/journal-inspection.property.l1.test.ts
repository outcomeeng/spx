import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_ERROR,
  JOURNAL_CLI_EXIT_CODE,
  type JournalCliDeps,
  journalListCommand,
  journalReadSetCommand,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import type { StateStoreFileSystem } from "@/lib/state-store";
import { arbitraryInvalidJournalLimit } from "@testing/generators/journal/type";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { withJournalHarness } from "@testing/harnesses/journal/harness";

class FailingPersistedRunInspectionFileSystem implements StateStoreFileSystem {
  mkdir(): Promise<never> {
    return Promise.reject(new Error());
  }

  writeFile(): Promise<never> {
    return Promise.reject(new Error());
  }

  appendFile(): Promise<never> {
    return Promise.reject(new Error());
  }

  readFile(): Promise<never> {
    return Promise.reject(new Error());
  }

  readdir(): Promise<never> {
    return Promise.reject(new Error());
  }

  lstat(): Promise<never> {
    return Promise.reject(new Error());
  }

  link(): Promise<never> {
    return Promise.reject(new Error());
  }

  rename(): Promise<never> {
    return Promise.reject(new Error());
  }

  rm(): Promise<never> {
    return Promise.reject(new Error());
  }
}

function localDeps(productDir: string, fs?: StateStoreFileSystem): JournalCliDeps {
  return {
    cwd: productDir,
    env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: false, githubPullRequest: false },
    ...(fs === undefined ? {} : { fs }),
    processEnv: {},
  };
}

describe("journal inspection properties", () => {
  it("rejects invalid run and event limits before inspecting runs", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());

    await fc.assert(
      fc.asyncProperty(arbitraryInvalidJournalLimit(), async (invalidLimit) => {
        await withJournalHarness(async (productDir) => {
          const fs = new FailingPersistedRunInspectionFileSystem();
          const listed = await journalListCommand({ branchSlug, type, limit: invalidLimit }, localDeps(productDir, fs));
          const readSetWithInvalidRunLimit = await journalReadSetCommand(
            { branchSlug, type, limit: invalidLimit },
            localDeps(productDir, fs),
          );
          const readSetWithInvalidEventLimit = await journalReadSetCommand(
            { branchSlug, type, eventLimit: invalidLimit },
            localDeps(productDir, fs),
          );

          expect(listed).toEqual({
            exitCode: JOURNAL_CLI_EXIT_CODE.ERROR,
            output: JOURNAL_CLI_ERROR.INVALID_RUN_LIMIT,
          });
          expect(readSetWithInvalidRunLimit).toEqual({
            exitCode: JOURNAL_CLI_EXIT_CODE.ERROR,
            output: JOURNAL_CLI_ERROR.INVALID_RUN_LIMIT,
          });
          expect(readSetWithInvalidEventLimit).toEqual({
            exitCode: JOURNAL_CLI_EXIT_CODE.ERROR,
            output: JOURNAL_CLI_ERROR.INVALID_READ_SET_EVENT_LIMIT,
          });
        });
      }),
    );
  });
});
