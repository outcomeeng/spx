import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_ENV,
  JOURNAL_CLI_EXIT_CODE,
  JOURNAL_CLI_READ_SET_EVENT_LIMIT,
  JOURNAL_CLI_RUN_LIMIT,
  type JournalCliDeps,
  journalListCommand,
  journalReadCommand,
  journalReadSetCommand,
  journalRenderCommand,
} from "@/commands/journal/cli";
import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import {
  JOURNAL_RUN_SEALED_FILTER,
  JOURNAL_RUN_TERMINAL_FILTER,
  type JournalRunMetadata,
} from "@/domains/journal/run-scope";
import {
  JOURNAL_RUN_EVENT,
  JOURNAL_RUN_STATE_STATUS,
  journalRunEventInput,
  type JournalRunState,
  type JournalRunStateStatus,
} from "@/domains/journal/run-state";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { compareAsciiStrings, createStateStoreRunToken } from "@/lib/state-store";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { JOURNAL_RUN_STATE_TEST_GENERATOR } from "@testing/generators/journal/run-state";
import { arbitraryJournalRunLimit } from "@testing/generators/journal/type";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

function localDeps(productDir: string): JournalCliDeps {
  return {
    cwd: productDir,
    env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: false, githubPullRequest: false },
    processEnv: {},
  };
}

function localDepsForBranch(productDir: string, branch: string): JournalCliDeps {
  return {
    ...localDeps(productDir),
    branch,
  };
}

interface DistinctJournalScopes {
  readonly branchSlug: string;
  readonly otherBranchSlug: string;
  readonly type: string;
  readonly otherType: string;
}

interface OrderedRunCreationInputs {
  readonly dates: readonly [Date, Date, Date, Date];
  readonly idBytes: Buffer;
}

interface SameMillisecondRunCreationInputs {
  readonly date: Date;
  readonly firstIdBytes: Buffer;
  readonly secondIdBytes: Buffer;
}

function sampleDistinctJournalScopes(): DistinctJournalScopes {
  return sampleStateStoreTestValue(
    fc
      .tuple(
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.branchSlug(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
      )
      .filter(([branchSlug, otherBranchSlug, type, otherType]) => branchSlug !== otherBranchSlug && type !== otherType)
      .map(([branchSlug, otherBranchSlug, type, otherType]) => ({ branchSlug, otherBranchSlug, type, otherType })),
  );
}

function sampleOrderedRunCreationInputs(): OrderedRunCreationInputs {
  return sampleStateStoreTestValue(
    fc
      .tuple(
        STATE_STORE_TEST_GENERATOR.runDate(),
        STATE_STORE_TEST_GENERATOR.runDate(),
        STATE_STORE_TEST_GENERATOR.runDate(),
        STATE_STORE_TEST_GENERATOR.runDate(),
        STATE_STORE_TEST_GENERATOR.runIdBytes(),
      )
      .filter(([first, second, third, fourth]) => {
        const timestamps = [first.getTime(), second.getTime(), third.getTime(), fourth.getTime()];
        return new Set(timestamps).size === timestamps.length;
      })
      .map(([first, second, third, fourth, idBytes]) => {
        const [oldest, middle, newer, newest] = [first, second, third, fourth].sort((left, right) =>
          left.getTime() - right.getTime()
        );
        if (oldest === undefined || middle === undefined || newer === undefined || newest === undefined) {
          throw new Error("expected four generated journal run dates");
        }
        return { dates: [oldest, middle, newer, newest] as const, idBytes };
      }),
  );
}

function sampleSameMillisecondRunCreationInputs(): SameMillisecondRunCreationInputs {
  return sampleStateStoreTestValue(
    fc
      .tuple(
        STATE_STORE_TEST_GENERATOR.runDate(),
        STATE_STORE_TEST_GENERATOR.runIdBytes(),
        STATE_STORE_TEST_GENERATOR.runIdBytes(),
      )
      .filter(([date, firstIdBytes, secondIdBytes]) => {
        const firstToken = createStateStoreRunToken({
          date,
          randomBytes: deterministicRunIdBytes(firstIdBytes),
        });
        const secondToken = createStateStoreRunToken({
          date,
          randomBytes: deterministicRunIdBytes(secondIdBytes),
        });
        return compareAsciiStrings(firstToken.runToken, secondToken.runToken) > 0;
      })
      .map(([date, firstIdBytes, secondIdBytes]) => ({ date, firstIdBytes, secondIdBytes })),
  );
}

function deterministicRunIdBytes(idBytes: Buffer): (size: number) => Buffer {
  return (size: number): Buffer => Buffer.from(idBytes.subarray(0, size));
}

function sampleTerminalRunState(status: JournalRunStateStatus): JournalRunState {
  return {
    ...sampleStateStoreTestValue(JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState()),
    status,
  };
}

function sampleUnregisteredBackendOverride(): string {
  return sampleStateStoreTestValue(
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((candidate) =>
      !Object.values(JOURNAL_BACKEND).some((registered) => registered === candidate)
    ),
  );
}

describe("journal inspection", () => {
  it("lists matching run metadata by type, branch scope, sealed state, terminal state, and recency", async () => {
    const { branchSlug, otherBranchSlug, type, otherType } = sampleDistinctJournalScopes();
    const runCreation = sampleOrderedRunCreationInputs();
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const [olderRunDate, newerRunDate, otherRunDate, terminalRunDate] = runCreation.dates;
      const first = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => olderRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const second = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => newerRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const otherBranch = await openJournalRun({ productDir, branchSlug: otherBranchSlug, type }, {
        now: () => otherRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const otherTypeRun = await openJournalRun({ productDir, branchSlug, type: otherType }, {
        now: () => otherRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const terminalRun = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => terminalRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      expect(first.ok && second.ok && otherBranch.ok && otherTypeRun.ok && terminalRun.ok).toBe(true);
      if (!first.ok || !second.ok || !otherBranch.ok || !otherTypeRun.ok || !terminalRun.ok) return;

      for (const opened of [first, second, otherBranch, otherTypeRun, terminalRun]) {
        await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());
      }
      await appendJournalEvent(
        terminalRun.value.ref,
        journalRunEventInput(
          JOURNAL_RUN_EVENT.COMPLETED_TYPE,
          sampleTerminalRunState(JOURNAL_RUN_STATE_STATUS.APPROVED),
          input,
        ),
        new RecordingJournalStreamSink(),
      );
      await sealJournalRun(first.value.ref);
      await sealJournalRun(second.value.ref);
      await sealJournalRun(otherBranch.value.ref);
      await sealJournalRun(terminalRun.value.ref);
      const expectedRunTokens = [second.value.ref.runToken, first.value.ref.runToken];
      const listLimit = sampleStateStoreTestValue(arbitraryJournalRunLimit(expectedRunTokens.length));
      const expectedCrossBranchRuns = [
        { branchSlug: otherBranchSlug, type, runToken: otherBranch.value.ref.runToken },
        { branchSlug, type, runToken: second.value.ref.runToken },
        { branchSlug, type, runToken: first.value.ref.runToken },
      ];
      const crossBranchLimit = sampleStateStoreTestValue(arbitraryJournalRunLimit(expectedCrossBranchRuns.length));

      const listed = await journalListCommand(
        {
          branchSlug,
          type,
          sealed: JOURNAL_RUN_SEALED_FILTER.SEALED,
          terminalState: JOURNAL_RUN_TERMINAL_FILTER.MISSING_STATE,
          limit: String(listLimit),
        },
        localDeps(productDir),
      );

      expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const runs = JSON.parse(listed.output) as Array<
        { readonly branchSlug: string; readonly type: string; readonly runToken: string }
      >;
      expect(runs).toHaveLength(listLimit);
      expect(runs.map((run) => run.runToken)).toEqual(expectedRunTokens.slice(0, listLimit));
      expect(runs[0]).toMatchObject({ branchSlug, type });

      const crossBranchList = await journalListCommand(
        {
          type,
          sealed: JOURNAL_RUN_SEALED_FILTER.SEALED,
          terminalState: JOURNAL_RUN_TERMINAL_FILTER.MISSING_STATE,
          limit: String(crossBranchLimit),
        },
        localDeps(productDir),
      );
      expect(crossBranchList.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const crossBranchRuns = JSON.parse(crossBranchList.output) as Array<
        { readonly branchSlug: string; readonly type: string; readonly runToken: string }
      >;
      expect(crossBranchRuns.map((run) => ({ branchSlug: run.branchSlug, type: run.type, runToken: run.runToken })))
        .toEqual(expectedCrossBranchRuns.slice(0, crossBranchLimit));
    });
  });

  it("bounds list and read-set output by default when no run limit is supplied", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const baseDate = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const idBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());
    const runCount = JOURNAL_CLI_RUN_LIMIT.DEFAULT + 1;
    const defaultLimitStressEventInputs = Array.from(
      { length: JOURNAL_CLI_READ_SET_EVENT_LIMIT.DEFAULT + 1 },
      () => input,
    );

    await withJournalHarness(async (productDir) => {
      for (const index of Array.from({ length: runCount }, (_, runIndex) => runIndex)) {
        const opened = await openJournalRun({ productDir, branchSlug, type }, {
          now: () => new Date(baseDate.getTime() + index),
          randomBytes: deterministicRunIdBytes(idBytes),
        });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const eventInputs = index === runCount - 1 ? defaultLimitStressEventInputs : [input];
        for (const eventInput of eventInputs) {
          await appendJournalEvent(opened.value.ref, eventInput, new RecordingJournalStreamSink());
        }
        await sealJournalRun(opened.value.ref);
      }

      const listed = await journalListCommand({ branchSlug, type }, localDeps(productDir));
      const readSet = await journalReadSetCommand({ branchSlug, type }, localDeps(productDir));

      expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(readSet.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const defaultReadSet = JSON.parse(readSet.output) as Array<{ readonly events: JournalEvent[] }>;
      expect(JSON.parse(listed.output)).toHaveLength(defaultReadSet.length);
      expect(defaultReadSet.length).toBe(JOURNAL_CLI_RUN_LIMIT.DEFAULT);
      expect(defaultReadSet.length).toBeGreaterThan(0);
      expect(defaultReadSet.length).toBeLessThan(runCount);
      const newestDefaultRunEvents = defaultReadSet.at(-1)?.events ?? [];
      expect(newestDefaultRunEvents.length).toBe(JOURNAL_CLI_READ_SET_EVENT_LIMIT.DEFAULT);
      expect(newestDefaultRunEvents.length).toBeGreaterThan(0);
      expect(newestDefaultRunEvents.length).toBeLessThan(defaultLimitStressEventInputs.length);
    });
  });

  it("reads and renders a listed run from an explicit branch slug", async () => {
    const { branchSlug, otherBranchSlug, type } = sampleDistinctJournalScopes();
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const opened = await openJournalRun({ productDir, branchSlug, type });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());

      const listed = await journalListCommand(
        { branchSlug, type },
        localDepsForBranch(productDir, otherBranchSlug),
      );
      expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const runs = JSON.parse(listed.output) as Array<
        { readonly branchSlug: string; readonly type: string; readonly runToken: string }
      >;
      expect(runs.map((run) => ({ branchSlug: run.branchSlug, type: run.type, runToken: run.runToken }))).toEqual([
        { branchSlug, type, runToken: opened.value.ref.runToken },
      ]);
      const selected = runs[0];
      if (selected === undefined) return;

      const read = await journalReadCommand(
        { branchSlug: selected.branchSlug, type: selected.type, runToken: selected.runToken },
        String(JOURNAL_SEQ_BASE),
        localDepsForBranch(productDir, otherBranchSlug),
      );
      const rendered = await journalRenderCommand(
        { branchSlug: selected.branchSlug, type: selected.type, runToken: selected.runToken },
        localDepsForBranch(productDir, otherBranchSlug),
      );

      expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(rendered.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect((JSON.parse(read.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
      expect((JSON.parse(rendered.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
    });
  });

  it("reads and renders a unique run token across branch scopes when branch slug is omitted", async () => {
    const { branchSlug, otherBranchSlug, type } = sampleDistinctJournalScopes();
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const opened = await openJournalRun({ productDir, branchSlug, type });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());

      const read = await journalReadCommand(
        { type, runToken: opened.value.ref.runToken },
        String(JOURNAL_SEQ_BASE),
        localDepsForBranch(productDir, otherBranchSlug),
      );
      const rendered = await journalRenderCommand(
        { type, runToken: opened.value.ref.runToken },
        localDepsForBranch(productDir, otherBranchSlug),
      );

      expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(rendered.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect((JSON.parse(read.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
      expect((JSON.parse(rendered.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
    });
  });

  it("reads only sealed runs in a branch/type scope in deterministic oldest-first order", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runCreation = sampleOrderedRunCreationInputs();
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const [firstRunDate, secondRunDate, thirdRunDate, unsealedRunDate] = runCreation.dates;
      const first = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => firstRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const second = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => secondRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const third = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => thirdRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      const unsealed = await openJournalRun({ productDir, branchSlug, type }, {
        now: () => unsealedRunDate,
        randomBytes: deterministicRunIdBytes(runCreation.idBytes),
      });
      expect(first.ok && second.ok && third.ok && unsealed.ok).toBe(true);
      if (!first.ok || !second.ok || !third.ok || !unsealed.ok) return;

      for (const opened of [first, second, third, unsealed]) {
        await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());
      }
      await appendJournalEvent(
        first.value.ref,
        journalRunEventInput(
          JOURNAL_RUN_EVENT.COMPLETED_TYPE,
          sampleTerminalRunState(JOURNAL_RUN_STATE_STATUS.APPROVED),
          input,
        ),
        new RecordingJournalStreamSink(),
      );
      await sealJournalRun(first.value.ref);
      await sealJournalRun(second.value.ref);
      await sealJournalRun(third.value.ref);
      const expectedRunTokens = [first.value.ref.runToken, second.value.ref.runToken, third.value.ref.runToken];
      const expectedLimitedRunTokens = [second.value.ref.runToken, third.value.ref.runToken];
      const expectedLimitedEventSeqs = [JOURNAL_SEQ_BASE];
      const readSetLimit = sampleStateStoreTestValue(
        arbitraryJournalRunLimit(expectedLimitedRunTokens.length).filter(
          (limit) => limit === expectedLimitedRunTokens.length,
        ),
      );
      const readSetEventLimit = sampleStateStoreTestValue(arbitraryJournalRunLimit(expectedLimitedEventSeqs.length));

      const readSet = await journalReadSetCommand({ branchSlug, type }, localDeps(productDir));
      const limitedReadSet = await journalReadSetCommand(
        { branchSlug, type, eventLimit: String(readSetEventLimit), limit: String(readSetLimit) },
        localDeps(productDir),
      );
      const readSetWithMalformedBackendOverride = await journalReadSetCommand(
        { branchSlug, type },
        {
          cwd: productDir,
          processEnv: { [JOURNAL_CLI_ENV.BACKEND]: sampleUnregisteredBackendOverride() },
        },
      );

      expect(readSet.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(limitedReadSet.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(readSetWithMalformedBackendOverride.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const runs = JSON.parse(readSet.output) as Array<
        { readonly runToken: string; readonly metadata: JournalRunMetadata; readonly events: JournalEvent[] }
      >;
      const limitedRuns = JSON.parse(limitedReadSet.output) as Array<
        { readonly runToken: string; readonly metadata: JournalRunMetadata; readonly events: JournalEvent[] }
      >;
      const overrideRuns = JSON.parse(readSetWithMalformedBackendOverride.output) as Array<
        { readonly runToken: string; readonly metadata: JournalRunMetadata; readonly events: JournalEvent[] }
      >;
      const firstRead = runs[0];
      const secondRead = runs[1];
      const thirdRead = runs[2];
      if (firstRead === undefined || secondRead === undefined || thirdRead === undefined) {
        throw new Error("expected three sealed journal runs");
      }
      expect(runs.map((run) => run.runToken)).toEqual(expectedRunTokens);
      expect(overrideRuns.map((run) => run.runToken)).toEqual(expectedRunTokens);
      expect(overrideRuns[0]?.metadata).toEqual(
        expect.objectContaining({
          branchSlug,
          runToken: first.value.ref.runToken,
          sealed: true,
          type,
        }),
      );
      expect(limitedRuns.map((run) => run.runToken)).toEqual(expectedLimitedRunTokens);
      expect(limitedRuns[0]?.events.map((event) => event.seq)).toEqual(expectedLimitedEventSeqs);
      expect(runs).toEqual([
        {
          events: [
            expect.objectContaining({ seq: JOURNAL_SEQ_BASE }),
            expect.objectContaining({ seq: JOURNAL_SEQ_BASE + 1 }),
          ],
          metadata: expect.objectContaining({
            branchSlug,
            eventCount: firstRead.events.length,
            runToken: first.value.ref.runToken,
            sealed: true,
            terminalState: JOURNAL_RUN_STATE_STATUS.APPROVED,
            type,
          }),
          runToken: first.value.ref.runToken,
        },
        {
          events: [expect.objectContaining({ seq: JOURNAL_SEQ_BASE })],
          metadata: expect.objectContaining({
            branchSlug,
            eventCount: secondRead.events.length,
            runToken: second.value.ref.runToken,
            sealed: true,
            terminalState: JOURNAL_RUN_TERMINAL_FILTER.MISSING_STATE,
            type,
          }),
          runToken: second.value.ref.runToken,
        },
        {
          events: [expect.objectContaining({ seq: JOURNAL_SEQ_BASE })],
          metadata: expect.objectContaining({
            branchSlug,
            eventCount: thirdRead.events.length,
            runToken: third.value.ref.runToken,
            sealed: true,
            terminalState: JOURNAL_RUN_TERMINAL_FILTER.MISSING_STATE,
            type,
          }),
          runToken: third.value.ref.runToken,
        },
      ]);
    });
  });

  it("orders same-millisecond runs by persisted creation metadata before the run-token tie-breaker", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const creation = sampleSameMillisecondRunCreationInputs();
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const fs = createInMemoryStateStoreFileSystem();
      const first = await openJournalRun({ productDir, branchSlug, type }, {
        fs,
        now: () => creation.date,
        randomBytes: deterministicRunIdBytes(creation.firstIdBytes),
      });
      const second = await openJournalRun({ productDir, branchSlug, type }, {
        fs,
        now: () => creation.date,
        randomBytes: deterministicRunIdBytes(creation.secondIdBytes),
      });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      await appendJournalEvent(first.value.ref, input, new RecordingJournalStreamSink(), { fs });
      await appendJournalEvent(second.value.ref, input, new RecordingJournalStreamSink(), { fs });
      await sealJournalRun(first.value.ref, { fs });
      await sealJournalRun(second.value.ref, { fs });
      const expectedListedRunTokens = [second.value.ref.runToken, first.value.ref.runToken];
      const listLimit = sampleStateStoreTestValue(arbitraryJournalRunLimit(expectedListedRunTokens.length));

      const deps = { ...localDeps(productDir), fs };
      const listed = await journalListCommand(
        {
          branchSlug,
          type,
          limit: String(listLimit),
        },
        deps,
      );
      const readSet = await journalReadSetCommand({ branchSlug, type }, deps);

      expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(readSet.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const listedRuns = JSON.parse(listed.output) as Array<{ readonly runToken: string }>;
      const sealedRuns = JSON.parse(readSet.output) as Array<{ readonly runToken: string }>;
      expect(listedRuns.map((run) => run.runToken)).toEqual(expectedListedRunTokens.slice(0, listLimit));
      expect(sealedRuns.map((run) => run.runToken)).toEqual([first.value.ref.runToken, second.value.ref.runToken]);
    });
  });
});
