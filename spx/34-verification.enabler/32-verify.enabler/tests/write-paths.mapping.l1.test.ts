import { basename, dirname, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { branchScopesDir, worktreeScopeDir } from "@/lib/state-store";
import {
  observeWritePathRun,
  VERIFICATION_TYPE_CASE_TITLE,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

const compareText = (left: string, right: string): number => left.localeCompare(right);

// A run of one verification type, scope, and branch key writes its journal into one runs directory
// and its verification context into one contexts directory, both below the branch scope of the Git
// common-dir product root, and stages its payloads in a run payload directory below one payload root
// of the local worktree root. The write-path report names those directories before any run starts;
// the files a started run then creates are the oracle for the first two, and the new directory that
// carries the run token below the worktree state directory is the oracle for the payload root, which
// is that directory's parent.
describe("verify write-path report directories", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports the canonical scope identity, the branch key, and the directories a %s-scope run then writes",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const { reported, run, writtenDirectories, worktreeBefore, worktreeAfter } = await observeWritePathRun(
            repository,
            repository,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const { locator, runToken } = JSON.parse(run.started.output) as VerifyStartReport;
          const branchScope = join(branchScopesDir(repository.productDir), report.branchSlug);
          const worktreeState = worktreeScopeDir(repository.productDir);
          const sharedDirectories = report.writeDirectories.filter(
            (directory) => directory.role !== VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS,
          );
          const payloadRoots = report.writeDirectories.filter(
            (directory) => directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS,
          );
          const runPayloadDirectories = [...worktreeAfter].filter(
            (path) =>
              !worktreeBefore.has(path) && path.startsWith(worktreeState + sep) && basename(path).includes(runToken),
          );

          expect(report.resolvedScope).toEqual({ scopeType, scopeIdentity: locator.scopeIdentity });
          expect(report.writeDirectories.map((directory) => directory.role).sort(compareText)).toEqual(
            Object.values(VERIFY_WRITE_DIRECTORY_ROLE).sort(compareText),
          );
          expect(sharedDirectories.map((directory) => directory.path).sort(compareText)).toEqual(
            [...new Set(writtenDirectories)].sort(compareText),
          );
          expect(
            report.writeDirectories.find((directory) => directory.role === VERIFY_WRITE_DIRECTORY_ROLE.JOURNAL_RUNS)
              ?.path,
          ).toBe(locator.storageNamespace);
          expect(writtenDirectories.map((directory) => directory.startsWith(branchScope + sep))).toEqual(
            writtenDirectories.map(() => true),
          );
          expect(runPayloadDirectories).toHaveLength(1);
          expect(payloadRoots.map((directory) => directory.path)).toEqual(
            runPayloadDirectories.map((directory) => dirname(directory)),
          );
          expect(
            payloadRoots.map((directory) => directory.path.startsWith(join(worktreeState, verificationType) + sep)),
          )
            .toEqual([true]);
        });
      },
    );
  });
});

// A reported path resolves the symbolic links of its nearest existing ancestor, and a directory that
// does not exist reports itself absent with the directories missing from that ancestor down. The
// checkout before and after a run starts is the oracle: the nearest existing ancestor exists before,
// and every missing directory exists afterward at the reported path.
describe("verify write-path report path resolution", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports every directory absent from a checkout without a state store, with the directories to create, for a %s-scope run",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const { reported, run, before, after } = await observeWritePathRun(
            repository,
            repository,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

          expect(report.writeDirectories).toHaveLength(Object.values(VERIFY_WRITE_DIRECTORY_ROLE).length);
          for (const directory of report.writeDirectories) {
            expect(directory.exists).toBe(false);
            expect(before.has(directory.path)).toBe(false);
            expect(after.has(directory.path)).toBe(true);
            expect(directory.missingDirectories.at(-1)).toBe(directory.path);
            expect(before.has(dirname(directory.missingDirectories[0] ?? directory.path))).toBe(true);
            expect(directory.missingDirectories.map((missing) => before.has(missing))).toEqual(
              directory.missingDirectories.map(() => false),
            );
            expect(directory.missingDirectories.slice(1).map((missing) => dirname(missing))).toEqual(
              directory.missingDirectories.slice(0, -1),
            );
          }
        });
      },
    );

    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports a directory a started run of another verification type created as existing and the others as missing below the branch directory or the worktree state directory for a %s-scope run",
      async (scopeType) => {
        for (const startedType of Object.values(VERIFY_VERIFICATION_TYPE).filter((type) => type !== verificationType)) {
          await withVerifyHeadCommitRepository(async (repository) => {
            const started = await repository.startRun(scopeType, startedType);
            expect(started.started.exitCode, started.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
            const { reported, run, before, after } = await observeWritePathRun(
              repository,
              repository,
              scopeType,
              verificationType,
            );
            expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
            const report = JSON.parse(reported.output) as VerifyPathsReport;
            expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
            const branchScope = join(branchScopesDir(repository.productDir), report.branchSlug);
            const worktreeState = worktreeScopeDir(repository.productDir);

            expect(report.writeDirectories.map((directory) => directory.exists)).toContain(true);
            expect(report.writeDirectories.map((directory) => directory.exists)).toContain(false);
            for (const directory of report.writeDirectories) {
              expect(directory.exists).toBe(before.has(directory.path));
              expect(after.has(directory.path)).toBe(true);
              expect(directory.missingDirectories.map((missing) => before.has(missing))).toEqual(
                directory.missingDirectories.map(() => false),
              );
              expect(directory.missingDirectories.slice(1).map((missing) => dirname(missing))).toEqual(
                directory.missingDirectories.slice(0, -1),
              );
              expect(directory.missingDirectories.at(-1)).toBe(directory.exists ? undefined : directory.path);
              expect(directory.missingDirectories.map((missing) => after.has(missing))).toEqual(
                directory.missingDirectories.map(() => true),
              );
              expect(
                directory.missingDirectories.slice(0, 1).map((missing) => dirname(missing)),
              ).toEqual(
                directory.exists
                  ? []
                  : [directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS ? worktreeState : branchScope],
              );
            }
          });
        }
      },
    );

    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports the resolved path of every directory below a state store linked to another location for a %s-scope run",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const linkedStore = await repository.linkStateStore();
          const { reported, run, before, after } = await observeWritePathRun(
            repository,
            repository,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

          expect(before.has(linkedStore)).toBe(true);
          for (const directory of report.writeDirectories) {
            expect(directory.path.startsWith(linkedStore + sep)).toBe(true);
            expect(directory.exists).toBe(false);
            expect(after.has(directory.path)).toBe(true);
            expect(directory.missingDirectories.at(-1)).toBe(directory.path);
            expect(dirname(directory.missingDirectories[0] ?? directory.path)).toBe(linkedStore);
            expect(directory.missingDirectories.slice(1).map((missing) => dirname(missing))).toEqual(
              directory.missingDirectories.slice(0, -1),
            );
            expect(directory.missingDirectories.map((missing) => after.has(missing))).toEqual(
              directory.missingDirectories.map(() => true),
            );
          }
        });
      },
    );
  });
});

// The write-path report resolves the Git common-dir product root, not the root of the worktree it is
// invoked from, and the payload root at the root of the worktree it is invoked from. In a linked
// worktree the two differ: the repository's checkout directory is the common-dir root, the linked
// worktree's own directory holds the payload root, and the files and directories a started run
// creates, also from the linked worktree, are the oracle.
describe("verify write-path report in a linked worktree", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports the directories below the common-dir product root a %s-scope run from a linked worktree then writes",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const linked = await repository.linkWorktree();
          const { reported, run, writtenDirectories, worktreeBefore, worktreeAfter } = await observeWritePathRun(
            repository,
            linked,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const { runToken } = JSON.parse(run.started.output) as VerifyStartReport;
          const branchScope = join(branchScopesDir(repository.productDir), report.branchSlug);
          const worktreeState = worktreeScopeDir(linked.worktreeDir);
          const sharedDirectories = report.writeDirectories.filter(
            (directory) => directory.role !== VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS,
          );
          const payloadRoots = report.writeDirectories.filter(
            (directory) => directory.role === VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS,
          );
          const runPayloadDirectories = [...worktreeAfter].filter(
            (path) =>
              !worktreeBefore.has(path) && path.startsWith(worktreeState + sep) && basename(path).includes(runToken),
          );

          expect(linked.worktreeDir).not.toBe(repository.productDir);
          expect(sharedDirectories.map((directory) => directory.path.startsWith(branchScope + sep))).toEqual(
            sharedDirectories.map(() => true),
          );
          expect(sharedDirectories.map((directory) => directory.path.startsWith(linked.worktreeDir + sep)))
            .toEqual(sharedDirectories.map(() => false));
          expect(sharedDirectories.map((directory) => directory.path).sort(compareText)).toEqual(
            [...new Set(writtenDirectories)].sort(compareText),
          );
          expect(runPayloadDirectories).toHaveLength(1);
          expect(payloadRoots.map((directory) => directory.path)).toEqual(
            runPayloadDirectories.map((directory) => dirname(directory)),
          );
          expect(
            payloadRoots.map((directory) => directory.path.startsWith(join(worktreeState, verificationType) + sep)),
          )
            .toEqual([true]);
          expect(payloadRoots.map((directory) => directory.path.startsWith(branchScope + sep))).toEqual([false]);
        });
      },
    );
  });
});
