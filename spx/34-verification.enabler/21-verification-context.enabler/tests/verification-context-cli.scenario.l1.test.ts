import { describe, expect, it } from "vitest";

import {
  VERIFICATION_CONTEXT_CLI_ERROR,
  VERIFICATION_CONTEXT_CLI_EXIT_CODE,
} from "@/commands/verification-context/cli";
import { VERIFICATION_CONTEXT_RUNTIME_ERROR } from "@/commands/verification-context/runtime";
import {
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
} from "@/domains/verification-context/context";
import { slugBranchIdentity } from "@/lib/state-store";
import {
  runBranchOverrideVerificationContextScenario,
  runChangesetVerificationContextScenario,
  runFileVerificationContextScenario,
  runIdenticalVerificationContextPersistenceScenario,
  runLinkedWorktreeVerificationContextScenario,
  runMismatchedVerificationContextPersistenceScenario,
  runUnsafeVerificationContextFileScenarios,
  runWindowsVerificationContextFileScenario,
} from "@testing/harnesses/verification-context/harness";

describe("verification-context CLI", () => {
  it("creates a persisted context for a file subject", async () => {
    await runFileVerificationContextScenario().then(
      ({ command, result, document, persistedBytes, canonicalJson, scenario }) => {
        expect(command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
        expect(persistedBytes).toBe(canonicalJson);
        expect(document.digest).toBe(result.digest);
        expect(document.context.subject).toEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
          path: scenario.request.path,
        });
        expect(document.context.predicate).toBe(scenario.request.predicate);
        expect(document.context.workflow.name).toBe(scenario.request.workflow);
      },
    );
  });

  it("reports the same context when persistence already contains identical content", async () => {
    await runIdenticalVerificationContextPersistenceScenario().then(
      ({ first, second, firstCommand, secondCommand }) => {
        expect(firstCommand.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
        expect(secondCommand.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
        expect(second.digest).toBe(first.digest);
        expect(second.contextPath).toBe(first.contextPath);
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
      },
    );
  });

  it("rejects persistence when an existing context path contains different content", async () => {
    await runMismatchedVerificationContextPersistenceScenario().then(({ command }) => {
      expect(command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
      expect(command.output).toBe(VERIFICATION_CONTEXT_RUNTIME_ERROR.CONTENT_MISMATCH);
    });
  });

  it("records the invoking worktree root while persisting through the common state root", async () => {
    await runLinkedWorktreeVerificationContextScenario().then((result) => {
      expect(result.command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      expect(result.result.contextPath.startsWith(result.storageProductDir)).toBe(true);
      expect(result.result.contextPath.startsWith(result.worktreeRoot)).toBe(false);
      expect(result.document.context.launch.productDir).toBe(result.worktreeRoot);
      expect(result.document.context.launch.headSha).toBe(result.headSha);
    });
  });

  it("creates a persisted context for a changeset subject", async () => {
    await runChangesetVerificationContextScenario().then(
      ({ command, result, document, persistedBytes, canonicalJson, scenario }) => {
        expect(command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
        expect(persistedBytes).toBe(canonicalJson);
        expect(document.digest).toBe(result.digest);
        expect(document.context.subject).toEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
          base: scenario.request.base,
          head: scenario.request.head,
        });
      },
    );
  });

  it("uses the verification branch environment override for the context scope", async () => {
    await runBranchOverrideVerificationContextScenario().then((result) => {
      expect(result.command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      expect(result.result.contextPath).toContain(slugBranchIdentity(result.branchIdentity));
      expect(result.document.context.launch.branchSlug).toBe(slugBranchIdentity(result.branchIdentity));
      expect(result.document.context.launch.branchIdentity).toBe(result.branchIdentity);
    });
  });

  it("canonicalizes Windows file separators before persistence", async () => {
    await runWindowsVerificationContextFileScenario().then(({ command, document, scenario }) => {
      expect(command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK);
      expect(document.context.subject).toEqual({
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path: scenario.request.path.replaceAll(
          VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
          VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        ),
      });
    });
  });

  it("rejects an absolute or parent-escaping file subject path before persistence", async () => {
    await runUnsafeVerificationContextFileScenarios().then(({ commands, persistenceMutationCount }) => {
      for (const command of commands) {
        expect(command.exitCode).toBe(VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR);
        expect(command.output).toBe(VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_UNSAFE);
      }
      expect(persistenceMutationCount).toBe(0);
    });
  });
});
