import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  type VerifyRenderReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import { VERIFY_APPEND_EVENT_FIELD, VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  readPayloadFile,
  samplePayloadFileName,
  stageEscapingPayload,
  stageRunPayload,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

/** The scope payloads a rendered run's journal holds, in append order. */
function scopePayloadsOf(rendered: CliCommandResult): readonly JsonValue[] {
  return (JSON.parse(rendered.output) as VerifyRenderReport).events
    .filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)
    .map((event) => (event.data as Readonly<Record<string, JsonValue>>)[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
}

describe("verify run-relative evidence payload", () => {
  it("reads the scope evidence a run-relative name selects from the run's payload directory, continued from a linked worktree", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun();
      const unit = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unjudgedScopeUnit(VERIFY_VERIFICATION_TYPE.REVIEW, payloads.repository.filePath),
      );
      const name = await stageRunPayload(run, JSON.stringify(unit));
      const linked = await payloads.repository.linkWorktree();

      const added = await verifyAppendScopeCommand(
        {
          ...run.selectors,
          runPayload: name,
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        },
        payloads.deps({ cwd: linked.worktreeDir }),
      );
      const rendered = await verifyRenderCommand(run.selectors, payloads.deps());

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(scopePayloadsOf(rendered)).toEqual([unit]);
    });
  });

  it("rejects a run-relative name whose path resolves outside the run's payload directory before any read or journal append", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await payloads.startRun();
      const unit = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unjudgedScopeUnit(VERIFY_VERIFICATION_TYPE.REVIEW, payloads.repository.filePath),
      );
      const { outsidePath, linkName } = await stageEscapingPayload(
        payloads.repository.productDir,
        run,
        JSON.stringify(unit),
      );
      const reads: string[] = [];
      const deps = payloads.deps({
        readPayloadSource: async (source) => {
          reads.push(source);
          return readPayloadFile(source);
        },
      });

      const attempts = [];
      for (const name of [`../${samplePayloadFileName()}`, outsidePath, linkName]) {
        attempts.push({
          name,
          added: await verifyAppendScopeCommand(
            {
              ...run.selectors,
              runPayload: name,
              idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
            },
            deps,
          ),
        });
      }
      const rendered = await verifyRenderCommand(run.selectors, payloads.deps());

      expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      for (const attempt of attempts) {
        expect(attempt.added.exitCode, attempt.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(attempt.added.output, attempt.name).toContain(VERIFY_CLI_ERROR.RUN_PAYLOAD_REJECTED);
      }
      expect(reads).toEqual([]);
      expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(scopePayloadsOf(rendered)).toEqual([]);
    });
  });
});
