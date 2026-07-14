import { describe, expect, it } from "vitest";

import { AGENT_SESSION_TOKEN_PATTERN, resolveAgentSessionId } from "@/domains/session/agent-session";
import { DEFAULT_SESSION_METADATA, parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId, parseSessionId, SESSION_ID_PATTERN } from "@/domains/session/timestamp";
import {
  arbitraryDistinctSessionInstantPair,
  arbitraryNonFrontMatterContent,
  arbitraryPathUnsafeAgentSessionIdentity,
  arbitraryValidSessionInstant,
} from "@testing/generators/session/session";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

function truncateToSecond(instant: Date): number {
  return instant.getTime() - instant.getMilliseconds();
}

export function registerSessionIdentityPropertyEvidence(): void {
  describe("session identity properties", () => {
    it("GIVEN any valid Date WHEN generated THEN ID matches the canonical pattern", () => {
      assertProperty(
        arbitraryValidSessionInstant(),
        (instant) => {
          expect(generateSessionId({ now: () => instant })).toMatch(SESSION_ID_PATTERN);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("GIVEN any two valid Dates WHEN IDs compared THEN lexicographic order matches chronological order", () => {
      assertProperty(
        arbitraryDistinctSessionInstantPair(),
        ([left, right]) => {
          const leftId = generateSessionId({ now: () => left });
          const rightId = generateSessionId({ now: () => right });
          const chronological = truncateToSecond(left) - truncateToSecond(right);
          const lexicographic = leftId.localeCompare(rightId);

          if (chronological < 0) expect(lexicographic).toBeLessThan(0);
          else expect(lexicographic).toBeGreaterThan(0);

          expect(parseSessionId(leftId)?.getTime()).toBe(truncateToSecond(left));
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("GIVEN content without frontmatter WHEN parsed THEN canonical defaults are returned", () => {
      assertProperty(
        arbitraryNonFrontMatterContent(),
        (content) => {
          expect(parseSessionMetadata(content)).toEqual(DEFAULT_SESSION_METADATA);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("GIVEN path-unsafe agent session identities WHEN resolved THEN safe deterministic tokens are returned", () => {
      assertProperty(
        arbitraryPathUnsafeAgentSessionIdentity(),
        (unsafeSessionToken) => {
          const firstClaudeToken = resolveAgentSessionId({ CLAUDE_SESSION_ID: unsafeSessionToken });
          const secondClaudeToken = resolveAgentSessionId({ CLAUDE_SESSION_ID: unsafeSessionToken });
          const codexToken = resolveAgentSessionId({
            CLAUDE_SESSION_ID: "",
            CODEX_THREAD_ID: unsafeSessionToken,
          });

          expect(firstClaudeToken).toBeDefined();
          expect(firstClaudeToken).toMatch(AGENT_SESSION_TOKEN_PATTERN);
          expect(firstClaudeToken).not.toBe(unsafeSessionToken);
          expect(secondClaudeToken).toBe(firstClaudeToken);
          expect(codexToken).toBe(firstClaudeToken);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}
