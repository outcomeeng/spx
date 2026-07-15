/**
 * The `test` verification type's runner, resolved through the testing registry.
 *
 * The executor reaches the `test` runner through `src/test/registry.ts` — it enumerates the
 * registry's language descriptors and drives each one's journal-streaming run, so it names no
 * language, per `spx/19-language-registration.adr.md`. Every present language streams its scope and
 * findings into the one injected sink; the run's terminal status folds the languages' statuses.
 */
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunInvocation,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type JournalStreamRunDependencies,
} from "@/test/languages/types";
import { type TestingRegistry, testingRegistry } from "@/test/registry";

import type { JournalStreamingRunner } from "@/commands/verification-exec/executor";

/**
 * Fold the terminal statuses of the languages that ran into the run's terminal status: any failing
 * language fails the run, any interruption interrupts it, and a run passes only when every language
 * that ran passed.
 */
function foldTerminalStatuses(statuses: readonly JournalRunTerminalStatus[]): JournalRunTerminalStatus {
  if (statuses.includes(JOURNAL_RUN_TERMINAL_STATUS.FAILED)) return JOURNAL_RUN_TERMINAL_STATUS.FAILED;
  if (statuses.includes(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED)) return JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED;
  return JOURNAL_RUN_TERMINAL_STATUS.PASSED;
}

/**
 * Resolve the `test` verification type's streaming runner from the testing registry. The runner
 * drives every registry language that exposes a journal-streaming run, streaming each into the
 * injected sink; a run over a registry whose languages are all absent or non-streaming is gated out.
 */
export function resolveTestRunner(registry: TestingRegistry = testingRegistry): JournalStreamingRunner {
  return {
    async runTestsStreaming(
      request: JournalRunRequest,
      deps: JournalStreamRunDependencies,
    ): Promise<JournalRunInvocation> {
      const statuses: JournalRunTerminalStatus[] = [];
      for (const language of registry.languages) {
        if (language.runTestsStreaming === undefined) continue;
        const invocation = await language.runTestsStreaming(request, deps);
        if (invocation.invoked) statuses.push(invocation.terminalStatus);
      }
      if (statuses.length === 0) return { invoked: false };
      return { invoked: true, terminalStatus: foldTerminalStatuses(statuses) };
    },
  };
}
