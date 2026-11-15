import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  type VerifyRenderReport,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import {
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  type PayloadDirectoryRepository,
  readPayloadFile,
  samplePayloadFileName,
  withPayloadDirectoryRepository,
} from "@testing/harnesses/verify/payload-directory";

const verificationType = VERIFY_VERIFICATION_TYPE.REVIEW;
const payloadName = samplePayloadFileName();

interface StartedRun {
  readonly report: VerifyStartReport;
  readonly options: {
    readonly verificationType: string;
    readonly scopeType: string;
    readonly scope: string;
    readonly run: string;
  };
}

async function startRun({ repository, deps }: PayloadDirectoryRepository): Promise<StartedRun> {
  const started = await verifyStartCommand(
    { verificationType, scopeType: VERIFY_SCOPE_TYPE.FILE, scope: repository.filePath, input: repository.filePath },
    deps(),
  );
  expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = JSON.parse(started.output) as VerifyStartReport;
  return {
    report,
    options: { verificationType, scopeType: VERIFY_SCOPE_TYPE.FILE, scope: repository.filePath, run: report.runToken },
  };
}

async function scopePayloads({ deps }: PayloadDirectoryRepository, run: StartedRun): Promise<readonly JsonValue[]> {
  const rendered = await verifyRenderCommand(run.options, deps());
  expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return (JSON.parse(rendered.output) as VerifyRenderReport).events
    .filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)
    .map((event) => (event.data as Readonly<Record<string, JsonValue>>)[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
}

describe("verify run-relative evidence payload", () => {
  it("reads the scope evidence a run-relative name selects from the run's payload directory, continued from a linked worktree", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await startRun(payloads);
      const unit = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, payloads.repository.filePath),
      );
      await writeFile(join(run.report.payloadDirectory, payloadName), JSON.stringify(unit));
      const linked = await payloads.repository.linkWorktree();

      const added = await verifyAppendScopeCommand(
        {
          ...run.options,
          runPayload: payloadName,
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        },
        payloads.deps({ cwd: linked.worktreeDir }),
      );

      expect(added.exitCode, added.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(await scopePayloads(payloads, run)).toEqual([unit]);
    });
  });

  it("rejects a run-relative name whose path resolves outside the run's payload directory before any read or journal append", async () => {
    await withPayloadDirectoryRepository(async (payloads) => {
      const run = await startRun(payloads);
      const unit = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unjudgedScopeUnit(verificationType, payloads.repository.filePath),
      );
      const outside = join(payloads.repository.productDir, payloadName);
      await writeFile(outside, JSON.stringify(unit));
      const linkName = samplePayloadFileName();
      await symlink(outside, join(run.report.payloadDirectory, linkName));
      const reads: string[] = [];
      const deps = payloads.deps({
        readPayloadSource: async (source) => {
          reads.push(source);
          return readPayloadFile(source);
        },
      });

      for (const name of [`../${payloadName}`, outside, linkName]) {
        const added = await verifyAppendScopeCommand(
          {
            ...run.options,
            runPayload: name,
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          },
          deps,
        );
        expect(added.exitCode, name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(added.output, name).toContain(VERIFY_CLI_ERROR.RUN_PAYLOAD_REJECTED);
      }

      expect(reads).toEqual([]);
      expect(await scopePayloads(payloads, run)).toEqual([]);
    });
  });
});
