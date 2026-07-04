import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyStartCommand } from "@/commands/verify/cli";
import { DESCRIPTOR_DIGEST_HEX_ENCODING, DESCRIPTOR_DIGEST_SHA256_ALGORITHM } from "@/config/descriptor-digest";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { pathsFromNameStatus } from "@/lib/git/name-status";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseStartReport,
  verifyDeps,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

function expectedRunInputDigest(source: string, content: string): string {
  return createHash(DESCRIPTOR_DIGEST_SHA256_ALGORITHM)
    .update(JSON.stringify({ content, source }))
    .digest(DESCRIPTOR_DIGEST_HEX_ENCODING);
}

describe("verify start run context", () => {
  it("creates a context, opens a run journal, and reports the run token, digest, changed scope, input, and locator", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();

    const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseStartReport(started.output);
    expect(report.runToken.length).toBeGreaterThan(0);
    expect(report.contextDigest.length).toBeGreaterThan(0);
    expect(report.changedScope).toEqual(pathsFromNameStatus(scenario.nameStatusStdout));
    expect(report.input.source).toBe(VERIFY_INPUT_SOURCE.STDIN);
    expect(report.input.digest).toBe(expectedRunInputDigest(VERIFY_INPUT_SOURCE.STDIN, scenario.inputContent));
    expect(report.locator.runToken).toBe(report.runToken);
    expect(report.locator.verificationType).toBe(scenario.verificationType);
    expect(report.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
    expect(report.locator.scopeIdentity).toBe(scenario.scope);
    expect(report.locator.runTarget.length).toBeGreaterThan(0);
  });

  it("persists the run journal at the reported run target", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();

    const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseStartReport(started.output);
    expect(report.locator.runTarget).toContain(report.runToken);
    // The run journal is opened empty — the run token is in the file name, events append later —
    // so the evidence of persistence is that the run file exists and reads back without rejecting.
    await expect(fs.readFile(report.locator.runTarget, STATE_STORE_TEXT_ENCODING)).resolves.toBeDefined();
  });
});
