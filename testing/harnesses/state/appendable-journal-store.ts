import { join } from "node:path";

import { execa } from "execa";
import fc from "fast-check";
import { expect } from "vitest";

import {
  createJournal,
  JOURNAL_ERROR,
  JOURNAL_SEQ_BASE,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH = ["node_modules", ".bin", "tsx"] as const;
const TEST_TYPESCRIPT_EXECUTION_ARGS = ["--input-type=module", "--eval"] as const;
const INTERRUPTION_TEMP_DIR_PREFIX = "spx-appendable-journal-interruption-";
const PRE_PUBLICATION_EXIT_CODE = 73;
const POST_PUBLICATION_EXIT_CODE = 74;
const INTERRUPTION_MODE_ENV = "SPX_JOURNAL_INTERRUPTION_MODE";
const INTERRUPTION_IDENTITY_ENV = "SPX_JOURNAL_INTERRUPTION_IDENTITY";
const INTERRUPTION_INPUT_ENV = "SPX_JOURNAL_INTERRUPTION_INPUT";
const INTERRUPTION_RUN_FILE_ENV = "SPX_JOURNAL_INTERRUPTION_RUN_FILE";
const PRE_PUBLICATION_MODE = "pre-publication";
const POST_PUBLICATION_MODE = "post-publication";

/** Prove sequence exclusivity when independent stores append to one run history concurrently. */
export async function assertOverlappingAppendSequenceProperty(): Promise<void> {
  await assertProperty(
    fc.tuple(
      arbitraryJournalEventInput(),
      arbitraryJournalEventInput(),
      arbitraryJournalIdentity(),
    ),
    async ([leftInput, rightInput, identity]) => {
      const fs = createInMemoryStateStoreFileSystem();
      const runFilePath = journalRunFilePath(identity.streamid);
      const leftJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
      const rightJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
      const outcomes = await Promise.allSettled([
        leftJournal.append(leftInput),
        rightJournal.append(rightInput),
      ]);
      const replay = await createAppendableJournalStore({ runFilePath, fs }).readAll();
      const fulfilled = outcomes.filter(isFulfilled);
      const rejected = outcomes.filter(isRejected);

      expect(replay.map((event) => event.seq)).toEqual(
        replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
      );
      expect(new Set(replay.map((event) => event.seq)).size).toBe(replay.length);
      expect(fulfilled).toHaveLength(replay.length);
      expect(rejected).toHaveLength(1);
      expect(rejectionMessage(rejected[0])).toBe(JOURNAL_ERROR.SEQ_CONSUMED);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

/** Prove fresh processes recover on both sides of atomic sequence publication. */
export async function assertAppendableJournalInterruptionCompliance(): Promise<void> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const firstInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const nextInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());

  await withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    expect(await runInterruptedAppend(PRE_PUBLICATION_MODE, runFilePath, identity, firstInput)).toBe(
      PRE_PUBLICATION_EXIT_CODE,
    );

    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const reopened = createJournal(reopenedStore, identity);
    const appended = await reopened.append(firstInput);
    expect(appended.seq).toBe(JOURNAL_SEQ_BASE);
    await expect(reopenedStore.readAll()).resolves.toEqual([appended]);
  });

  await withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    expect(await runInterruptedAppend(POST_PUBLICATION_MODE, runFilePath, identity, firstInput)).toBe(
      POST_PUBLICATION_EXIT_CODE,
    );

    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const reopened = createJournal(reopenedStore, identity);
    const replay = await reopenedStore.readAll();
    expect(replay).toHaveLength(1);
    expect(replay[0]?.seq).toBe(JOURNAL_SEQ_BASE);
    await expect(reopened.append(nextInput)).resolves.toMatchObject({ seq: JOURNAL_SEQ_BASE + 1 });
  });
}

function isFulfilled<T>(outcome: PromiseSettledResult<T>): outcome is PromiseFulfilledResult<T> {
  return outcome.status === "fulfilled";
}

function isRejected<T>(outcome: PromiseSettledResult<T>): outcome is PromiseRejectedResult {
  return outcome.status === "rejected";
}

function rejectionMessage(outcome: PromiseRejectedResult | undefined): string | undefined {
  const reason: unknown = outcome?.reason;
  return reason instanceof Error ? reason.message : undefined;
}

async function runInterruptedAppend(
  mode: typeof PRE_PUBLICATION_MODE | typeof POST_PUBLICATION_MODE,
  runFilePath: string,
  identity: JournalIdentity,
  input: JournalEventInput,
): Promise<number | undefined> {
  const productDir = process.cwd();
  const tsxBinary = join(productDir, ...TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH);
  const result = await execa(tsxBinary, [...TEST_TYPESCRIPT_EXECUTION_ARGS, interruptedAppendScript()], {
    cwd: productDir,
    env: {
      ...buildGitTestEnvironment(),
      [INTERRUPTION_MODE_ENV]: mode,
      [INTERRUPTION_IDENTITY_ENV]: JSON.stringify(identity),
      [INTERRUPTION_INPUT_ENV]: JSON.stringify(input),
      [INTERRUPTION_RUN_FILE_ENV]: runFilePath,
    },
    extendEnv: false,
    reject: false,
  });
  return result.exitCode;
}

function interruptedAppendScript(): string {
  return `
    import { createJournal } from "@/lib/agent-run-journal";
    import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
    import { defaultStateStoreFileSystem, EXCLUSIVE_CREATE_FLAG } from "@/lib/state-store";

    const mode = process.env.${INTERRUPTION_MODE_ENV};
    const identity = JSON.parse(process.env.${INTERRUPTION_IDENTITY_ENV});
    const input = JSON.parse(process.env.${INTERRUPTION_INPUT_ENV});
    const runFilePath = process.env.${INTERRUPTION_RUN_FILE_ENV};
    const fs = {
      ...defaultStateStoreFileSystem,
      async writeFile(path, data, options) {
        await defaultStateStoreFileSystem.writeFile(path, data, options);
        if (mode === ${JSON.stringify(PRE_PUBLICATION_MODE)} && options?.flag === EXCLUSIVE_CREATE_FLAG) {
          process.exit(${PRE_PUBLICATION_EXIT_CODE});
        }
      },
      async link(existingPath, newPath) {
        await defaultStateStoreFileSystem.link(existingPath, newPath);
        if (mode === ${JSON.stringify(POST_PUBLICATION_MODE)}) {
          process.exit(${POST_PUBLICATION_EXIT_CODE});
        }
      },
    };
    await createJournal(createAppendableJournalStore({ runFilePath, fs }), identity).append(input);
  `;
}
