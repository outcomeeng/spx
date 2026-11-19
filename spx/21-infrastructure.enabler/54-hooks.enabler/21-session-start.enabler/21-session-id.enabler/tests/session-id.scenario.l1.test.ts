import { describe, expect, it } from "vitest";

import { AGENT_IDENTITY_KIND } from "@/domains/agent-environment/config";
import { AGENT_SESSION_TOKEN_PATTERN } from "@/domains/session/agent-session";
import {
  arbitraryIdentityEnvironmentCase,
  IDENTITY_NON_MEMBER_STATE,
  identityVariableSubsets,
} from "@testing/generators/agent-environment/identity";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  withEnvironmentSessionStartIdentityEvidence,
  withPayloadPrecedenceSessionStartIdentityEvidence,
  withPiSessionStartIdentityEvidence,
  withUnsafePayloadSessionStartIdentityEvidence,
  withWhitespaceClaudeSessionStartIdentityEvidence,
} from "@testing/harnesses/hooks/session-start";

describe("hook session-start session identity", () => {
  describe("a payload with no session id and exactly one non-empty identity variable", () => {
    for (const members of identityVariableSubsets().filter((subset) => subset.length === 1)) {
      for (const nonMemberState of [IDENTITY_NON_MEMBER_STATE.ABSENT, IDENTITY_NON_MEMBER_STATE.EMPTY]) {
        it(`uses ${members[0]} as the session id with the other variables ${nonMemberState}`, async () => {
          const { environment, expected } = sampleGeneratedValue(
            arbitraryIdentityEnvironmentCase({ members, nonMemberState, withHookExports: false }),
          );
          if (expected.kind !== AGENT_IDENTITY_KIND.IDENTIFIED) throw new Error("a one-member subset identifies");

          await withEnvironmentSessionStartIdentityEvidence(environment, (evidence) => {
            expect(evidence.result.ok).toBe(true);
            if (!evidence.result.ok) throw new Error(evidence.result.error);
            expect(evidence.result.value.sessionId).toBe(expected.sessionId);
            expect(evidence.result.value.claimed).toBe(true);
          });
        });
      }
    }
  });

  describe("a payload with no session id and none, or two or more, non-empty identity variables", () => {
    for (const members of identityVariableSubsets().filter((subset) => subset.length !== 1)) {
      for (const nonMemberState of [IDENTITY_NON_MEMBER_STATE.ABSENT, IDENTITY_NON_MEMBER_STATE.EMPTY]) {
        it(
          `resolves no session id and writes no claim for members [${
            members.join(", ")
          }] with the other variables ${nonMemberState}`,
          async () => {
            const { environment } = sampleGeneratedValue(
              arbitraryIdentityEnvironmentCase({ members, nonMemberState, withHookExports: false }),
            );

            await withEnvironmentSessionStartIdentityEvidence(environment, (evidence) => {
              expect(evidence.result.ok).toBe(true);
              if (!evidence.result.ok) throw new Error(evidence.result.error);
              expect(evidence.result.value.sessionId).toBeUndefined();
              expect(evidence.result.value.claimed).toBe(false);
            });
          },
        );
      }
    }
  });

  it("normalizes a path-unsafe payload session id before exporting it", async () => {
    await withUnsafePayloadSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toMatch(AGENT_SESSION_TOKEN_PATTERN);
      expect(evidence.result.value.sessionId).not.toBe(evidence.payloadSessionId);
      expect(evidence.result.value.claimed).toBe(true);
    });
  });

  it("uses the other identity variable when the Claude Code identity variable holds only whitespace", async () => {
    await withWhitespaceClaudeSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.codexSessionId);
      expect(evidence.result.value.claimed).toBe(true);
    });
  });

  it("uses the hook payload session id before an identity variable naming another session", async () => {
    await withPayloadPrecedenceSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.payloadSessionId);
      expect(evidence.result.value.claimed).toBe(true);
    });
  });

  it("uses the exact Pi transcript header as the native session identity", async () => {
    await withPiSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.sessionId);
      expect(evidence.result.value.sessionId).not.toBe(evidence.decoySessionId);
      expect(evidence.canonicalTranscriptPath).not.toBe(evidence.transcriptPath);
      expect(evidence.transcriptPathsRead).toEqual([evidence.canonicalTranscriptPath]);
      expect(evidence.result.value.claimed).toBe(true);
    });
  });
});
