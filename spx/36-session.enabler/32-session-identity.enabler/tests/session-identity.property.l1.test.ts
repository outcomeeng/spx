import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveAgentSessionId } from "@/domains/session/agent-session";
import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId, parseSessionId } from "@/domains/session/timestamp";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const PROPERTY_DATE_MIN = new Date("2000-01-01T00:00:00.000Z");
const PROPERTY_DATE_MAX = new Date("2099-12-28T23:59:59.000Z");
const SESSION_ID_SPEC_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const SAFE_AGENT_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXPECTED_DEFAULT_SESSION_METADATA = {
  priority: "medium",
  specs: [],
  files: [],
  git_ref: "",
  goal: "",
  next_step: "",
} as const;

function truncateToSecond(instant: Date): number {
  return instant.getTime() - instant.getMilliseconds();
}

describe("session identity properties", () => {
  it("GIVEN any valid Date WHEN generated THEN ID matches the canonical pattern", () => {
    fc.assert(
      fc.property(
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
        (instant) => {
          expect(generateSessionId({ now: () => instant })).toMatch(SESSION_ID_SPEC_PATTERN);
        },
      ),
    );
  });

  it("GIVEN any two valid Dates WHEN IDs compared THEN lexicographic order matches chronological order", () => {
    fc.assert(
      fc.property(
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
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
          expect(parseSessionMetadata(content)).toEqual(EXPECTED_DEFAULT_SESSION_METADATA);
        },
      ),
    );
  });

  it("GIVEN invalid priority values WHEN parsed THEN default priority is used", () => {
    fc.assert(
      fc.property(
        fc.string().filter((priority) =>
          !["high", "medium", "low"].includes(priority)
          && !priority.includes("\n")
          && !priority.includes(SESSION_FRONT_MATTER_DELIMITER)
        ),
        (priority) => {
          const content = buildSessionFrontMatterContent([`priority: ${JSON.stringify(priority)}`], "# Session");

          expect(parseSessionMetadata(content).priority).toBe(EXPECTED_DEFAULT_SESSION_METADATA.priority);
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
          expect(firstClaudeToken).toMatch(SAFE_AGENT_SESSION_TOKEN_PATTERN);
          expect(firstClaudeToken).not.toBe(unsafeSessionToken);
          expect(secondClaudeToken).toBe(firstClaudeToken);
          expect(codexToken).toBe(firstClaudeToken);
        },
      ),
    );
  });
});
