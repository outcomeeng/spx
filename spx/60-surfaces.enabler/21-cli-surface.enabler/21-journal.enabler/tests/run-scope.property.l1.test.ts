import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { JOURNAL_CLI_READ_SET_EVENT_LIMIT, JOURNAL_CLI_RUN_LIMIT } from "@/commands/journal/cli";
import {
  appendJournalEvent,
  listJournalRuns,
  openJournalRun,
  readSealedJournalRunSet,
  sealJournalRun,
} from "@/commands/journal/runtime";
import {
  JOURNAL_RUN_SEALED_FILTER,
  JOURNAL_RUN_TERMINAL_FILTER,
  journalRunFilePath,
  journalRunsDir,
} from "@/domains/journal/run-scope";
import { runFileName, STATE_STORE_ERROR, STATE_STORE_PATH, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("journalRunFilePath", () => {
  it("composes the branch-scoped run file path for every valid scope", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          const result = journalRunFilePath({ productDir, branchSlug, type, runToken });

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value).toBe(
            join(
              productDir,
              STATE_STORE_SCOPE_PATH.SPX_DIR,
              STATE_STORE_SCOPE_PATH.BRANCH_SCOPE,
              branchSlug,
              type,
              STATE_STORE_PATH.RUNS_DIR,
              runFileName(runToken),
            ),
          );
        },
      ),
    );
  });

  it("rejects an opaque type segment containing an unsafe path marker", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_TOKEN,
          });
        },
      ),
    );
  });

  it("rejects a run token containing an unsafe path marker", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_TOKEN,
          });
        },
      ),
    );
  });

  it("rejects a branch slug that is not normalized for storage", () => {
    fc.assert(
      fc.property(
        STATE_STORE_TEST_GENERATOR.productRoot(),
        STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.runToken(),
        (productDir, branchSlug, type, runToken) => {
          expect(journalRunFilePath({ productDir, branchSlug, type, runToken })).toEqual({
            ok: false,
            error: STATE_STORE_ERROR.INVALID_BRANCH_SLUG,
          });
        },
      ),
    );
  });
});

describe("journal run-scope discovery", () => {
  it("enumerates only matching run files deterministically for the same filters", async () => {
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            STATE_STORE_TEST_GENERATOR.productRoot(),
            STATE_STORE_TEST_GENERATOR.branchSlug(),
            STATE_STORE_TEST_GENERATOR.branchSlug(),
            STATE_STORE_TEST_GENERATOR.scopeToken(),
            STATE_STORE_TEST_GENERATOR.scopeToken(),
            STATE_STORE_TEST_GENERATOR.runDate(),
            STATE_STORE_TEST_GENERATOR.runIdBytes(),
            STATE_STORE_TEST_GENERATOR.runIdBytes(),
            STATE_STORE_TEST_GENERATOR.runIdBytes(),
          )
          .filter(([, branchSlug, otherBranchSlug, type, otherType, , sealedBytes, unsealedBytes, otherBytes]) => {
            const byteSets = [
              sealedBytes.toString("hex"),
              unsealedBytes.toString("hex"),
              otherBytes.toString("hex"),
            ];
            const uniqueByteSets = new Set(byteSets);
            return branchSlug !== otherBranchSlug
              && type !== otherType
              && uniqueByteSets.size === byteSets.length;
          }),
        async (
          [productDir, branchSlug, otherBranchSlug, type, otherType, date, sealedBytes, unsealedBytes, otherBytes],
        ) => {
          const fs = createInMemoryStateStoreFileSystem();
          const sealed = await openJournalRun(
            { productDir, branchSlug, type },
            { fs, now: () => date, randomBytes: (size) => Buffer.from(sealedBytes.subarray(0, size)) },
          );
          const unsealed = await openJournalRun(
            { productDir, branchSlug, type },
            { fs, now: () => date, randomBytes: (size) => Buffer.from(unsealedBytes.subarray(0, size)) },
          );
          const otherScope = await openJournalRun(
            { productDir, branchSlug: otherBranchSlug, type: otherType },
            { fs, now: () => date, randomBytes: (size) => Buffer.from(otherBytes.subarray(0, size)) },
          );
          expect(sealed.ok && unsealed.ok && otherScope.ok).toBe(true);
          if (!sealed.ok || !unsealed.ok || !otherScope.ok) return;

          await appendJournalEvent(sealed.value.ref, input, new RecordingJournalStreamSink(), { fs });
          await appendJournalEvent(unsealed.value.ref, input, new RecordingJournalStreamSink(), { fs });
          await appendJournalEvent(otherScope.value.ref, input, new RecordingJournalStreamSink(), { fs });
          await sealJournalRun(sealed.value.ref, { fs });
          await sealJournalRun(otherScope.value.ref, { fs });

          const matchingRunsDir = journalRunsDir({ productDir, branchSlug, type });
          expect(matchingRunsDir.ok).toBe(true);
          if (!matchingRunsDir.ok) return;
          await fs.writeFile(join(matchingRunsDir.value, `${otherType}${STATE_STORE_PATH.JSONL_EXTENSION}`), "");

          const listScope = {
            productDir,
            branchSlug,
            type,
            sealed: JOURNAL_RUN_SEALED_FILTER.SEALED,
            terminalState: JOURNAL_RUN_TERMINAL_FILTER.MISSING_STATE,
            limit: JOURNAL_CLI_RUN_LIMIT.DEFAULT,
          };
          const firstList = await listJournalRuns(listScope, { fs });
          const secondList = await listJournalRuns(listScope, { fs });
          const readSet = await readSealedJournalRunSet(
            {
              productDir,
              branchSlug,
              type,
              eventLimit: JOURNAL_CLI_READ_SET_EVENT_LIMIT.DEFAULT,
              limit: JOURNAL_CLI_RUN_LIMIT.DEFAULT,
            },
            { fs },
          );

          expect(firstList.ok && secondList.ok && readSet.ok).toBe(true);
          if (!firstList.ok || !secondList.ok || !readSet.ok) return;
          expect(secondList.value.map((run) => run.runToken)).toEqual(firstList.value.map((run) => run.runToken));
          expect(firstList.value.map((run) => run.runToken)).toEqual([sealed.value.ref.runToken]);
          expect(readSet.value.map((run) => run.runToken)).toEqual([sealed.value.ref.runToken]);
        },
      ),
    );
  });
});
