import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFICATION_CONTEXT_CLI_ERROR,
  VERIFICATION_CONTEXT_CLI_EXIT_CODE,
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  type VerificationContextCliDeps,
  verificationContextCreateCommand,
} from "@/commands/verification-context/cli";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import {
  sampleVerificationContextTestValue,
  VERIFICATION_CONTEXT_TEST_GENERATOR,
} from "@testing/generators/verification-context";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withGitEnv } from "@testing/harnesses/with-git-env";

describe("verification-context CLI", () => {
  it("creates a persisted context for a file subject", async () => {
    const path = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      const created = await verificationContextCreateCommand({
        subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path,
        predicate,
        workflow,
      }, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = JSON.parse(created.output) as { readonly digest: string; readonly contextPath: string };
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly path: string };
          readonly predicate: string;
          readonly workflow: { readonly name: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE, path });
      expect(document.context.predicate).toBe(predicate);
      expect(document.context.workflow.name).toBe(workflow);
    });
  });

  it("creates a persisted context for a changeset subject", async () => {
    const base = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef());
    const head = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      const created = await verificationContextCreateCommand({
        subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base,
        head,
        predicate,
        workflow,
      }, deps);

      expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      const result = JSON.parse(created.output) as { readonly digest: string; readonly contextPath: string };
      const document = JSON.parse(await fs.readFile(result.contextPath, STATE_STORE_TEXT_ENCODING)) as {
        readonly digest: string;
        readonly context: {
          readonly subject: { readonly kind: string; readonly base: string; readonly head: string };
        };
      };
      expect(document.digest).toBe(result.digest);
      expect(document.context.subject).toEqual({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET, base, head });
    });
  });

  it("rejects an absolute or parent-escaping file subject path before persistence", async () => {
    const path = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath());
    const predicate = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
    const workflow = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow());
    const createdAt = sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt());
    const fs = createInMemoryStateStoreFileSystem();

    await withGitEnv(async ({ path: productDir }) => {
      const deps: VerificationContextCliDeps = { cwd: productDir, fs, now: () => createdAt, processEnv: {} };

      for (
        const unsafePath of [
          productDir,
          join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY_SEGMENT, path),
        ]
      ) {
        const created = await verificationContextCreateCommand({
          subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
          path: unsafePath,
          predicate,
          workflow,
        }, deps);

        expect(created.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
        expect(created.output).toBe(VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_UNSAFE);
      }
    });
  });
});
