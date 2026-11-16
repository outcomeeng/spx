import { dirname, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  VERIFY_WRITE_DIRECTORY_ROLE,
  type VerifyPathsReport,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import {
  WRITE_PATH_REPORT_MAPPING,
  WRITE_PATH_REPORT_PLACEHOLDER,
  WRITE_PATH_REPORT_SEPARATOR,
} from "@testing/fixtures/verify/write-paths/write-path-report";
import {
  observeWritePathRun,
  VERIFICATION_TYPE_CASE_TITLE,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const reportedPath = (report: VerifyPathsReport, role: string): string | undefined =>
  report.writeDirectories.find((directory) => directory.role === role)?.path;

const fileWritingDirectories = (report: VerifyPathsReport): readonly string[] =>
  report.writeDirectories
    .filter((directory) => directory.role !== VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS)
    .map((directory) => directory.path);

const reportedDirectories = (report: VerifyPathsReport): Readonly<Record<string, string>> =>
  Object.fromEntries(report.writeDirectories.map((directory) => [directory.role, directory.path]));

type MappedRole = keyof typeof WRITE_PATH_REPORT_MAPPING;

const mappedRoles = Object.keys(WRITE_PATH_REPORT_MAPPING) as readonly MappedRole[];

// The product-root-relative segments the Mapping's table states for one directory role, with its
// placeholders replaced by the run's branch slug and verification type.
const mappedSegments = (role: MappedRole, branchSlug: string, verificationType: string): readonly string[] =>
  WRITE_PATH_REPORT_MAPPING[role]
    .split(WRITE_PATH_REPORT_SEPARATOR)
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment === WRITE_PATH_REPORT_PLACEHOLDER.BRANCH_SLUG
        ? branchSlug
        : segment === WRITE_PATH_REPORT_PLACEHOLDER.VERIFICATION_TYPE
        ? verificationType
        : segment
    );

// The directory of every role the Mapping states, below `root`. `fromStateStore` drops the
// Mapping's first segment, the state store directory, for a root that is the store itself.
const mappedDirectories = (
  root: string,
  branchSlug: string,
  verificationType: string,
  fromStateStore = false,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    mappedRoles.map((role) => [
      role,
      join(root, ...mappedSegments(role, branchSlug, verificationType).slice(fromStateStore ? 1 : 0)),
    ]),
  );

// The branch directory: the leading segments every directory the Mapping states shares.
const mappedBranchDirectory = (root: string, branchSlug: string, verificationType: string): string => {
  const [first = [], ...others] = mappedRoles.map((role) => mappedSegments(role, branchSlug, verificationType));
  const sharedLength = first.findIndex((segment, index) => others.some((other) => other[index] !== segment));
  return join(root, ...first.slice(0, sharedLength === -1 ? first.length : sharedLength));
};

// A run of one verification type, scope, and branch key writes its journal into one runs directory
// and its verification context into one contexts directory, and owns one payload directory inside
// its type's payload root. The write-path report names those directories before any run starts. The
// Mapping's literal layout, read from its table and filled with the run's branch slug and
// verification type, is the oracle for every reported path; the files a started run then creates,
// and the payload directory it reports, show that the run writes into the directories reported.
describe("verify write-path report directories", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports the canonical scope identity, the branch key, and the directories a %s-scope run then writes",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const { reported, run, writtenDirectories } = await observeWritePathRun(
            repository,
            repository,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const { locator, payloadDirectory } = JSON.parse(run.started.output) as VerifyStartReport;
          const branchScope = mappedBranchDirectory(repository.productDir, report.branchSlug, verificationType);

          expect(report.resolvedScope).toEqual({ scopeType, scopeIdentity: locator.scopeIdentity });
          expect(report.writeDirectories).toHaveLength(mappedRoles.length);
          expect(reportedDirectories(report)).toEqual(
            mappedDirectories(repository.productDir, report.branchSlug, verificationType),
          );
          expect([...fileWritingDirectories(report)].sort(compareText)).toEqual(
            [...new Set(writtenDirectories)].sort(compareText),
          );
          expect(reportedPath(report, VERIFY_WRITE_DIRECTORY_ROLE.JOURNAL_RUNS)).toBe(locator.storageNamespace);
          expect(reportedPath(report, VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS)).toBe(dirname(payloadDirectory));
          expect(writtenDirectories.map((directory) => directory.startsWith(branchScope + sep))).toEqual(
            writtenDirectories.map(() => true),
          );
          expect(payloadDirectory.startsWith(branchScope + sep)).toBe(true);
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

          expect(report.writeDirectories).toHaveLength(mappedRoles.length);
          expect(reportedDirectories(report)).toEqual(
            mappedDirectories(repository.productDir, report.branchSlug, verificationType),
          );
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
      "reports a directory a started run of another verification type created as existing and the others as missing below the branch directory for a %s-scope run",
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
            const branchScope = mappedBranchDirectory(repository.productDir, report.branchSlug, verificationType);

            expect(reportedDirectories(report)).toEqual(
              mappedDirectories(repository.productDir, report.branchSlug, verificationType),
            );
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
              ).toEqual(directory.exists ? [] : [branchScope]);
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
          expect(reportedDirectories(report)).toEqual(
            mappedDirectories(linkedStore, report.branchSlug, verificationType, true),
          );
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
// invoked from. In a linked worktree the two differ: the repository's checkout directory is the
// common-dir root, and the files a started run creates, also from the linked worktree, are the oracle.
describe("verify write-path report in a linked worktree", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))(VERIFICATION_TYPE_CASE_TITLE, (verificationType) => {
    it.each(Object.values(VERIFY_SCOPE_TYPE))(
      "reports the directories below the common-dir product root a %s-scope run from a linked worktree then writes",
      async (scopeType) => {
        await withVerifyHeadCommitRepository(async (repository) => {
          const linked = await repository.linkWorktree();
          const { reported, run, writtenDirectories } = await observeWritePathRun(
            repository,
            linked,
            scopeType,
            verificationType,
          );
          expect(reported.exitCode, reported.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const report = JSON.parse(reported.output) as VerifyPathsReport;
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const branchScope = mappedBranchDirectory(repository.productDir, report.branchSlug, verificationType);

          expect(linked.worktreeDir).not.toBe(repository.productDir);
          expect(reportedDirectories(report)).toEqual(
            mappedDirectories(repository.productDir, report.branchSlug, verificationType),
          );
          expect(report.writeDirectories.map((directory) => directory.path.startsWith(branchScope + sep))).toEqual(
            report.writeDirectories.map(() => true),
          );
          expect(report.writeDirectories.map((directory) => directory.path.startsWith(linked.worktreeDir + sep)))
            .toEqual(report.writeDirectories.map(() => false));
          expect([...fileWritingDirectories(report)].sort(compareText)).toEqual(
            [...new Set(writtenDirectories)].sort(compareText),
          );
          const { payloadDirectory } = JSON.parse(run.started.output) as VerifyStartReport;
          expect(reportedPath(report, VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS)).toBe(dirname(payloadDirectory));
        });
      },
    );
  });
});
