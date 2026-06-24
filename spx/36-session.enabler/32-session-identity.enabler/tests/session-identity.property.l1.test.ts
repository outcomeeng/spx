import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { AGENT_SESSION_TOKEN_PATTERN, resolveAgentSessionId } from "@/domains/session/agent-session";
import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { DEFAULT_SESSION_METADATA, parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId, parseSessionId, SESSION_ID_PATTERN } from "@/domains/session/timestamp";
import { SESSION_FRONT_MATTER, SESSION_PRIORITY } from "@/domains/session/types";
import { arbitraryValidSessionInstant } from "@testing/generators/session/session";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { buildSessionMarkdownBody } from "@testing/harnesses/session/harness";

function truncateToSecond(instant: Date): number {
  return instant.getTime() - instant.getMilliseconds();
}

describe("session identity properties", () => {
  it("GIVEN any valid Date WHEN generated THEN ID matches the canonical pattern", () => {
    fc.assert(
      fc.property(
        arbitraryValidSessionInstant(),
        (instant) => {
          expect(generateSessionId({ now: () => instant })).toMatch(SESSION_ID_PATTERN);
        },
      ),
    );
  });

  it("GIVEN any two valid Dates WHEN IDs compared THEN lexicographic order matches chronological order", () => {
    fc.assert(
      fc.property(
        arbitraryValidSessionInstant(),
        arbitraryValidSessionInstant(),
        (left, right) => {
          const leftId = generateSessionId({ now: () => left });
          const rightId = generateSessionId({ now: () => right });
          const chronological = truncateToSecond(left) - truncateToSecond(right);
          const lexicographic = leftId.localeCompare(rightId);

          if (chronological < 0) expect(lexicographic).toBeLessThan(0);
          else if (chronological > 0) expect(lexicographic).toBeGreaterThan(0);
          else expect(lexicographic).toBe(0);

          expect(parseSessionId(leftId)?.getTime()).toBe(truncateToSecond(left));
        },
      ),
    );
  });

  it("GIVEN content without frontmatter WHEN parsed THEN canonical defaults are returned", () => {
    fc.assert(
      fc.property(
        fc.string().filter((content) => !content.startsWith(SESSION_FRONT_MATTER_DELIMITER)),
        (content) => {
          expect(parseSessionMetadata(content)).toEqual(DEFAULT_SESSION_METADATA);
        },
      ),
    );
  });

  it("GIVEN invalid priority values WHEN parsed THEN default priority is used", () => {
    const validPriorities = new Set<string>(Object.values(SESSION_PRIORITY));
    fc.assert(
      fc.property(
        fc.string().filter((priority) =>
          !validPriorities.has(priority)
          && !priority.includes("\n")
          && !priority.includes(SESSION_FRONT_MATTER_DELIMITER)
        ),
        (priority) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.PRIORITY}: ${JSON.stringify(priority)}`,
          ], buildSessionMarkdownBody("invalid priority"));

          expect(parseSessionMetadata(content).priority).toBe(DEFAULT_SESSION_METADATA.priority);
        },
      ),
    );
  });

  it("GIVEN path-unsafe agent session identities WHEN resolved THEN safe deterministic tokens are returned", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(),
          STATE_STORE_TEST_GENERATOR.unsafeScopeToken(),
        ),
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
      ),
    );
  });
});
