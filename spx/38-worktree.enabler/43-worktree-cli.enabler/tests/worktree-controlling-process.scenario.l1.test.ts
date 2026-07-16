import { describe, expect, it } from "vitest";

import { unreadableStartedAt } from "@/domains/worktree/occupancy-store";
import {
  withAgentAncestorEvidence,
  withControllingPidOverrideEvidence,
  withImmediateParentControllingProcessEvidence,
  withInterpretedAgentAncestorEvidence,
  withInvalidParentPidEvidence,
  withPiControllingProcessEvidence,
  withUnreadableControllingPidOverrideEvidence,
} from "@testing/harnesses/worktree/harness";

describe("worktree controlling-process resolution", () => {
  it("records the SPX_WORKTREE_CONTROLLING_PID override when it names a live process", () => {
    withControllingPidOverrideEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: evidence.startedAt,
        host: evidence.host,
      });
    });
  });

  it("records an unreadable start token when the override names a live process whose start time cannot be read", () => {
    withUnreadableControllingPidOverrideEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: unreadableStartedAt(evidence.processPid),
        host: evidence.host,
      });
    });
  });

  it("walks past the transient hook to the ancestor whose command names an agent runtime", () => {
    withAgentAncestorEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: evidence.startedAt,
        host: evidence.host,
      });
    });
  });

  it("detects an agent invoked through an interpreter rather than falling back to the hook", () => {
    withInterpretedAgentAncestorEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: evidence.startedAt,
        host: evidence.host,
      });
    });
  });

  it("recognizes a Pi agent ancestor invoked through an interpreter", () => {
    withPiControllingProcessEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: evidence.startedAt,
        host: evidence.host,
      });
    });
  });

  it("falls back to the immediate parent when no ancestor names an agent runtime", () => {
    withImmediateParentControllingProcessEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value).toEqual({
        pid: evidence.processPid,
        startedAt: evidence.startedAt,
        host: evidence.host,
      });
    });
  });

  it("rejects pid zero before applying the unreadable-start fallback", () => {
    withInvalidParentPidEvidence((evidence) => {
      expect(evidence.result.ok).toBe(false);
    });
  });
});
