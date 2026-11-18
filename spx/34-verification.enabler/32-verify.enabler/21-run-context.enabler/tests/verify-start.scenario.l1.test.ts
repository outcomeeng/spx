import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { TEST_DIGEST_NAME } from "@testing/harnesses/crypto/digest-names";
import {
  observeLinkedWorktreeStart,
  observeNestedDirectoryStart,
  observePersistedRunJournal,
  observeStartedRunContext,
} from "@testing/harnesses/verify/harness";

const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

// The canonical JSON form, written here rather than taken from the production canonicalizer: every
// object's keys in code-unit order at every depth, and no insignificant whitespace.
const canonicalJson = (value: unknown): string =>
  JSON.stringify(
    value,
    (_key, member: unknown) =>
      member instanceof Object && !Array.isArray(member)
        ? Object.fromEntries(Object.entries(member).sort(([left], [right]) => compareCodeUnits(left, right)))
        : member,
  );

const sha256Hex = (text: string): string =>
  createHash(TEST_DIGEST_NAME.SHA256_ALGORITHM)
    .update(text, TEST_DIGEST_NAME.UTF8_ENCODING)
    .digest(TEST_DIGEST_NAME.HEX_ENCODING);

describe("verify start run context", () => {
  it("creates a context, opens a run journal, and reports the run token, digest, changed scope, input, and locator", async () => {
    await observeStartedRunContext().then(
      ({ scenario, command, report, persistedContext }) => {
        expect(command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(report.runToken.length).toBeGreaterThan(0);
        // The persisted bytes are the oracle: the document is in canonical form, its context carries
        // the scenario's subject, predicate, workflow, and launch, and the reported digest is the
        // SHA-256 of that context's canonical form, which the document also records.
        const persisted = JSON.parse(persistedContext) as {
          readonly digest: unknown;
          readonly context: Readonly<Record<string, unknown>>;
        };
        expect(persistedContext).toBe(canonicalJson(persisted));
        expect(persisted.context).toMatchObject({
          subject: { base: scenario.base, head: scenario.head },
          predicate: scenario.verificationType,
          workflow: { name: scenario.verificationType },
          launch: {
            productDir: scenario.productDir,
            branchIdentity: scenario.branchIdentity,
            headSha: scenario.headSha,
            createdAt: scenario.launchedAt.toISOString(),
          },
        });
        expect(report.contextDigest).toBe(sha256Hex(canonicalJson(persisted.context)));
        expect(persisted.digest).toBe(report.contextDigest);
        expect(report.resolvedScope).toEqual([...scenario.changedPaths].sort(compareCodeUnits));
        expect(report.input.source).toBe(VERIFY_INPUT_SOURCE.STDIN);
        expect(report.input.digest).toBe(
          sha256Hex(canonicalJson({ content: scenario.inputContent, source: report.input.source })),
        );
        expect(report.locator.runToken).toBe(report.runToken);
        expect(report.locator.verificationType).toBe(scenario.verificationType);
        expect(report.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
        expect(report.locator.scopeIdentity).toBe(scenario.scope);
        expect(report.locator.runTarget.length).toBeGreaterThan(0);
      },
    );
  });

  it("persists the run journal at the reported run target", async () => {
    await observePersistedRunJournal().then(({ command, report, persistedEvents }) => {
      expect(command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(report.locator.runTarget).toContain(report.runToken);
      expect(persistedEvents.length).toBeGreaterThan(0);
    });
  });

  it("reports product-relative changed scope when started from a nested directory", async () => {
    await observeNestedDirectoryStart().then((observation) => {
      expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.report.resolvedScope).toEqual(observation.expectedScope);
      expect(observation.changedScopeCwd).toBe(observation.expectedChangedScopeCwd);
    });
  });

  it("uses the linked worktree for diffs and the common root for state", async () => {
    await observeLinkedWorktreeStart().then((observation) => {
      expect(observation.command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.changedScopeCwd).toBe(observation.expectedChangedScopeCwd);
      expect(observation.report.locator.runTarget).toContain(observation.stateRoot);
    });
  });
});
