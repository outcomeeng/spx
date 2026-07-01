import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyStartCommand } from "@/commands/verify/cli";
import { VERIFY_SCOPE_ERROR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { pathsFromNameStatus } from "@/lib/git/name-status";
import { formatNameStatusZ, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  startReportFor,
  verifyDeps,
  verifyStartOptions,
  withChangedPaths,
  withScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify changeset scope mapping", () => {
  it("resolves any changeset into the derived changed-file scope", async () => {
    const base = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(
        VERIFY_TEST_GENERATOR.changesetRange(),
        VERIFY_TEST_GENERATOR.changedPaths(),
        async (range, changedPaths) => {
          const scenario = withChangedPaths(withScope(base, range.base, range.head), changedPaths);
          const report = await startReportFor(scenario);
          expect(report.changedScope).toEqual(pathsFromNameStatus(formatNameStatusZ(changedPaths)));
        },
      ),
    );
  });

  it("maps base and head into the context reconstruction fields: distinct changesets yield distinct context digests", async () => {
    const base = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(
        VERIFY_TEST_GENERATOR.changesetRange(),
        VERIFY_TEST_GENERATOR.changesetRange(),
        async (first, second) => {
          fc.pre(first.base !== second.base || first.head !== second.head);
          const firstReport = await startReportFor(withScope(base, first.base, first.head));
          const secondReport = await startReportFor(withScope(base, second.base, second.head));
          expect(secondReport.contextDigest).not.toBe(firstReport.contextDigest);
        },
      ),
    );
  });

  it("keeps derived changed paths outside the canonical context: one changeset, different changed sets, one context digest", async () => {
    const base = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(
        VERIFY_TEST_GENERATOR.changesetRange(),
        VERIFY_TEST_GENERATOR.changedPathsPair(),
        async (range, pair) => {
          const scoped = withScope(base, range.base, range.head);
          const first = await startReportFor(withChangedPaths(scoped, pair.first));
          const second = await startReportFor(withChangedPaths(scoped, pair.second));
          expect(second.contextDigest).toBe(first.contextDigest);
          expect(second.changedScope).not.toEqual(first.changedScope);
        },
      ),
    );
  });

  it("maps the resolved selectors and run target to the reported run token across verification types and changesets", async () => {
    const base = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(
        VERIFY_TEST_GENERATOR.verificationType(),
        VERIFY_TEST_GENERATOR.changesetRange(),
        async (verificationType, range) => {
          const scenario = withVerificationType(withScope(base, range.base, range.head), verificationType);
          const report = await startReportFor(scenario);
          expect(report.locator.runToken).toBe(report.runToken);
          expect(report.locator.verificationType).toBe(verificationType);
          expect(report.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
          expect(report.locator.scopeIdentity).toBe(scenario.scope);
          expect(report.locator.backendIdentity.length).toBeGreaterThan(0);
          expect(report.locator.storageNamespace.length).toBeGreaterThan(0);
          expect(report.locator.runTarget.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("rejects a working-tree scope type that the verification-context substrate cannot represent", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();

    const started = await verifyStartCommand(
      { ...verifyStartOptions(scenario), scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE },
      verifyDeps(scenario, fs),
    );

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
  });
});
