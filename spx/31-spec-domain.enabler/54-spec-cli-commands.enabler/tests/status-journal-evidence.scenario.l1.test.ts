import { describe, expect, it } from "vitest";

import { runTestsCommand } from "@/commands/test";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { otherBranchSlug, withJournaledNode } from "@testing/harnesses/testing/status-journal";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("a sealed test run journal supplies the verdict of each linked reference", () => {
  it("resolves a reference whose module a recorded finding names as failed", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, failingCaseIn, record }) => {
      const [named, unnamed] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(named) }, { moduleId: moduleIdOf(unnamed) }],
        findings: [failingCaseIn(named)],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.FAILED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      expect(outcomes[named]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
    });
  });

  it("resolves a recorded module no finding names as passed when the run's terminal status is passed", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      await record({
        headCommit: repository.commit,
        scopes: repository.testPaths.map((path) => ({ moduleId: moduleIdOf(path) })),
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      for (const path of repository.testPaths) {
        expect(outcomes[path]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      }
    });
  });

  it("resolves a recorded module no finding names as not-run when the run's terminal status is failed", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, failingCaseIn, record }) => {
      const [named, unnamed] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(named) }, { moduleId: moduleIdOf(unnamed) }],
        findings: [failingCaseIn(named)],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.FAILED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      expect(outcomes[unnamed]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  });

  it("resolves a recorded module no finding names as not-run when the run's terminal status is interrupted", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      await record({
        headCommit: repository.commit,
        scopes: repository.testPaths.map((path) => ({ moduleId: moduleIdOf(path) })),
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.INTERRUPTED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      for (const path of repository.testPaths) {
        expect(outcomes[path]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      }
    });
  });

  it("resolves a reference whose test path the journal holds no scope event for as not-run", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [covered, uncovered] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(covered) }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      expect(outcomes[covered]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      expect(outcomes[uncovered]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  });

  it("resolves a reference as not-run when only a module whose path shares its trailing segments is covered", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [covered] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(`other-module/${covered}`) }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, [covered]);

      expect(outcomes[covered]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  });

  it("resolves a reference as not-run when only a sealed run of another branch covers it", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [covered] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(covered) }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      }, otherBranchSlug());

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, [covered]);

      expect(outcomes[covered]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  });

  it("resolves every reference as not-run when the journal records no head commit", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      await record({
        headCommit: undefined,
        scopes: repository.testPaths.map((path) => ({ moduleId: moduleIdOf(path) })),
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      for (const path of repository.testPaths) {
        expect(outcomes[path]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      }
    });
  });

  it("takes the verdict from the journal when recorded last-run evidence reports every path passed", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, failingCaseIn, record }) => {
      const [named, unnamed] = repository.testPaths;
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: repository.env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(named) }, { moduleId: moduleIdOf(unnamed) }],
        findings: [failingCaseIn(named)],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.FAILED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      expect(outcomes[named]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
      expect(outcomes[unnamed]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  });

  it("takes a reference's verdict and its read paths from the one newest run that covers it", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, failingCaseIn, record }) => {
      const [path] = repository.testPaths;
      const [olderRead, newerRead] = repository.subjectPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(path), readPaths: [olderRead] }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(path), readPaths: [newerRead] }],
        findings: [failingCaseIn(path)],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.FAILED,
      });

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, [path]);
      const read = await resolvers.resolveReadPaths(repository.nodeId, path, NODE_STATUS_EVIDENCE_OUTCOME.FAILED);

      expect(outcomes[path]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
      expect(read).toEqual([newerRead]);
    });
  });
});

describe("a journal-sourced entry is current while no path it read differs from the commit the run recorded", () => {
  it("leaves the entry resolved after a commit that changes no path the run read", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [path] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(path), readPaths: [...repository.subjectPaths] }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });
      await repository.commitUnrelatedFile();

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, [path]);

      expect(outcomes[path]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
    });
  });

  it("leaves unresolved exactly the entries whose read set holds the changed path", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [readsChanged, readsOther] = repository.testPaths;
      const [changedSubject, otherSubject] = repository.subjectPaths;
      await record({
        headCommit: repository.commit,
        scopes: [
          { moduleId: moduleIdOf(readsChanged), readPaths: [changedSubject] },
          { moduleId: moduleIdOf(readsOther), readPaths: [otherSubject] },
        ],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });
      await repository.editSubject(0);
      await repository.commitAll();

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, repository.testPaths);

      expect(Object.hasOwn(outcomes, readsChanged)).toBe(false);
      expect(outcomes[readsOther]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
    });
  });

  it("leaves the entry unresolved after the node's spec changes", async () => {
    await withJournaledNode(async ({ repository, resolvers, moduleIdOf, record }) => {
      const [path] = repository.testPaths;
      await record({
        headCommit: repository.commit,
        scopes: [{ moduleId: moduleIdOf(path), readPaths: [...repository.subjectPaths] }],
        findings: [],
        terminalStatus: JOURNAL_RUN_STATE_STATUS.PASSED,
      });
      await repository.editSpecText();
      await repository.commitAll();

      const outcomes = await resolvers.resolveOutcome(repository.nodeId, [path]);

      expect(Object.hasOwn(outcomes, path)).toBe(false);
    });
  });
});
