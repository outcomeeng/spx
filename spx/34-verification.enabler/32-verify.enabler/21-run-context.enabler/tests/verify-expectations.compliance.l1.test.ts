import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  VERIFY_EXPECTATIONS_ERROR,
  VERIFY_EXPECTATIONS_FIELD,
  VERIFY_EXPECTATIONS_SCHEMA_VERSION,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_SCOPE_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyHeadCommitRepository } from "@testing/harnesses/verify/repository";

function expectationsDocument(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ [VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]: VERIFY_EXPECTATIONS_SCHEMA_VERSION, ...fields });
}

describe("verify start expectations compliance", () => {
  it("records the expectations a changeset-scoped run is started with on its run-context event", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [repository.filePath] }),
      ).then((run) => {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(run.runContextData[0]?.[VERIFY_RUN_CONTEXT_EVENT_FIELD.EXPECTATIONS]).toEqual({
          [VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]: VERIFY_EXPECTATIONS_SCHEMA_VERSION,
          [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [repository.filePath],
        });
      });
    });
  });

  it("records no additional paths when the expectations omit them", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      await repository.startRun(VERIFY_SCOPE_TYPE.CHANGESET, undefined, expectationsDocument({})).then((run) => {
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const recorded = run.runContextData[0]?.[VERIFY_RUN_CONTEXT_EVENT_FIELD.EXPECTATIONS] as Record<
          string,
          unknown
        >;
        expect(recorded[VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]).toBe(VERIFY_EXPECTATIONS_SCHEMA_VERSION);
        expect(recorded[VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS] ?? []).toEqual([]);
      });
    });
  });

  it("rejects an expectations document that is not an object before any run exists", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        sampleVerifyTestValue(VERIFY_TEST_GENERATOR.nonObjectJsonDocument()),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.runToken).toBeUndefined();
        expect(run.runContextData).toEqual([]);
      });
    });
  });

  it("rejects an unsupported schema version before any run exists, naming the field", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const version = sampleVerifyTestValue(
        VERIFY_TEST_GENERATOR.unsupportedExpectationsSchemaVersion(VERIFY_EXPECTATIONS_SCHEMA_VERSION),
      );
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        JSON.stringify({ [VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]: version }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION);
        expect(run.runToken).toBeUndefined();
      });
    });
  });

  it("rejects an additionalPaths value that is not an array before any run exists, naming the field", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const declared = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.nonArrayAdditionalPaths());
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: declared }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(VERIFY_EXPECTATIONS_ERROR.ADDITIONAL_PATHS_NOT_ARRAY);
        expect(run.runToken).toBeUndefined();
        expect(run.runContextData).toEqual([]);
      });
    });
  });

  it("rejects an additionalPaths entry that is not a string before any run exists, naming the field", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const declared = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.additionalPathsWithNonStringEntry());
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: declared }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(VERIFY_EXPECTATIONS_ERROR.ADDITIONAL_PATHS_NOT_ARRAY);
        expect(run.runToken).toBeUndefined();
        expect(run.runContextData).toEqual([]);
      });
    });
  });

  it("rejects expectations on a run that is not changeset-scoped before any run exists", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      await repository.startRun(VERIFY_SCOPE_TYPE.FILE, undefined, expectationsDocument({})).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.runToken).toBeUndefined();
      });
    });
  });

  it("rejects an additional path the head commit does not hold before any run exists, naming the path", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const absentPath = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.absentProductPath(repository.filePath));
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [absentPath] }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(absentPath);
        expect(run.runToken).toBeUndefined();
      });
    });
  });

  it("rejects an additional path only the checkout holds, naming the path", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const checkoutOnlyPath = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.absentProductPath(repository.filePath));
      await repository.writeCheckoutFile(checkoutOnlyPath);
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [checkoutOnlyPath] }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(checkoutOnlyPath);
        expect(run.runToken).toBeUndefined();
      });
    });
  });

  it("rejects an additional path that is not product-relative, naming the path", async () => {
    await withVerifyHeadCommitRepository(async (repository) => {
      const escapingPath = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.nonProductRelativePath());
      await repository.startRun(
        VERIFY_SCOPE_TYPE.CHANGESET,
        undefined,
        expectationsDocument({ [VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS]: [escapingPath] }),
      ).then((run) => {
        expect(run.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(run.started.output).toContain(escapingPath);
        expect(run.runToken).toBeUndefined();
      });
    });
  });
});
