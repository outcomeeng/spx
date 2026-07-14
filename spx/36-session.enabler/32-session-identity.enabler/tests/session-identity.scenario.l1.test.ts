import { AGENT_SESSION_TOKEN_PATTERN, resolveAgentSessionId } from "@/domains/session/agent-session";
import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { DEFAULT_SESSION_METADATA, parseSessionMetadata } from "@/domains/session/list";
import {
  generateSessionId,
  parseSessionId,
  SESSION_ID_PATTERN,
  SESSION_ID_SEPARATOR,
} from "@/domains/session/timestamp";
import { DEFAULT_PRIORITY, SESSION_FRONT_MATTER, SESSION_PRIORITY } from "@/domains/session/types";
import {
  arbitrarySessionPriority,
  arbitraryValidSessionInstant,
  sampleDistinctSessionIds,
  samplePathUnsafeAgentSessionIdentity,
} from "@testing/generators/session/session";
import { buildSessionMarkdownBody, DEFAULT_GIT_DEPS_BRANCH } from "@testing/harnesses/session/harness";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const fixtureYear = 2026;
const invalidTimestamp = "not-a-timestamp";

function utcFixtureInstant(month: number, day: number, hour: number, minute: number, second: number): Date {
  return new Date(Date.UTC(fixtureYear, month, day, hour, minute, second));
}

function expectedSessionId(instant: Date): string {
  const iso = instant.toISOString();
  return `${iso.slice(0, 10)}${SESSION_ID_SEPARATOR}${iso.slice(11, 19).replaceAll(":", "-")}`;
}

describe("resolveAgentSessionId", () => {
  it("GIVEN agent session environment values WHEN resolved THEN Claude takes precedence and Codex is the fallback", () => {
    const [claudeSession, codexSession] = sampleDistinctSessionIds(2);

    expect(resolveAgentSessionId({
      CLAUDE_SESSION_ID: claudeSession,
      CODEX_THREAD_ID: codexSession,
    })).toBe(claudeSession);
    expect(resolveAgentSessionId({
      CODEX_THREAD_ID: codexSession,
    })).toBe(codexSession);
    expect(resolveAgentSessionId({
      CLAUDE_SESSION_ID: "",
      CODEX_THREAD_ID: codexSession,
    })).toBe(codexSession);
    expect(resolveAgentSessionId({
      CLAUDE_SESSION_ID: "",
      CODEX_THREAD_ID: "",
    })).toBeUndefined();
    expect(resolveAgentSessionId({})).toBeUndefined();
  });

  it("GIVEN path-unsafe Codex thread identity WHEN resolved THEN returns a safe token", () => {
    const pathUnsafeIdentity = samplePathUnsafeAgentSessionIdentity();
    const resolved = resolveAgentSessionId({
      CODEX_THREAD_ID: pathUnsafeIdentity,
    });

    expect(resolved).toBeDefined();
    expect(resolved).toMatch(AGENT_SESSION_TOKEN_PATTERN);
    expect(resolved).not.toBe(pathUnsafeIdentity);
  });
});

describe("generateSessionId", () => {
  it("GIVEN injected time WHEN generated THEN matches SESSION_ID_PATTERN", () => {
    const id = generateSessionId({
      now: () => utcFixtureInstant(0, 13, 8, 1, 5),
    });

    expect(id).toMatch(SESSION_ID_PATTERN);
    expect(id).toContain(SESSION_ID_SEPARATOR);
  });

  it("GIVEN single-digit components WHEN generated THEN zero-pads all fields", () => {
    const instant = utcFixtureInstant(0, 3, 5, 7, 9);
    const id = generateSessionId({
      now: () => instant,
    });

    expect(id).toBe(expectedSessionId(instant));
  });

  it("GIVEN end-of-day time WHEN generated THEN handles 23:59:59", () => {
    const instant = utcFixtureInstant(11, 31, 23, 59, 59);
    const id = generateSessionId({
      now: () => instant,
    });

    expect(id).toBe(expectedSessionId(instant));
  });
});

describe("parseSessionId", () => {
  it("GIVEN valid session ID WHEN parsed THEN returns Date with correct components", () => {
    const expected = utcFixtureInstant(0, 13, 8, 1, 5);
    const date = parseSessionId(expectedSessionId(expected));

    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(expected.getUTCFullYear());
    expect(date!.getUTCMonth()).toBe(expected.getUTCMonth());
    expect(date!.getUTCDate()).toBe(expected.getUTCDate());
    expect(date!.getUTCHours()).toBe(expected.getUTCHours());
    expect(date!.getUTCMinutes()).toBe(expected.getUTCMinutes());
    expect(date!.getUTCSeconds()).toBe(expected.getUTCSeconds());
  });

  it("GIVEN invalid format WHEN parsed THEN returns null", () => {
    expect(parseSessionId(invalidTimestamp)).toBeNull();
    expect(parseSessionId("")).toBeNull();
    expect(parseSessionId(`${fixtureYear}/01/13 08:01:05`)).toBeNull();
  });

  it("GIVEN out-of-range month WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`${fixtureYear}-13-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
    expect(parseSessionId(`${fixtureYear}-00-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
  });

  it("GIVEN out-of-range hour WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`${fixtureYear}-01-01${SESSION_ID_SEPARATOR}24-00-00`)).toBeNull();
  });

  it("GIVEN out-of-range minute WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`${fixtureYear}-01-01${SESSION_ID_SEPARATOR}00-60-00`)).toBeNull();
  });

  it("GIVEN out-of-range second WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`${fixtureYear}-01-01${SESSION_ID_SEPARATOR}00-00-60`)).toBeNull();
  });
});

describe("generateSessionId → parseSessionId roundtrip (property-based)", () => {
  it("GIVEN any valid Date WHEN generated then parsed THEN roundtrips correctly", () => {
    const validDate = arbitraryValidSessionInstant();

    fc.assert(
      fc.property(validDate, (original) => {
        const id = generateSessionId({ now: () => original });
        const parsed = parseSessionId(id);

        expect(parsed).not.toBeNull();
        expect(parsed!.getUTCFullYear()).toBe(original.getUTCFullYear());
        expect(parsed!.getUTCMonth()).toBe(original.getUTCMonth());
        expect(parsed!.getUTCDate()).toBe(original.getUTCDate());
        expect(parsed!.getUTCHours()).toBe(original.getUTCHours());
        expect(parsed!.getUTCMinutes()).toBe(original.getUTCMinutes());
        expect(parsed!.getUTCSeconds()).toBe(original.getUTCSeconds());
      }),
    );
  });

  it("GIVEN two different times WHEN generated THEN lexicographic order matches chronological order", () => {
    fc.assert(
      fc.property(arbitraryValidSessionInstant(), arbitraryValidSessionInstant(), (dateA, dateB) => {
        const idA = generateSessionId({ now: () => dateA });
        const idB = generateSessionId({ now: () => dateB });

        const chronological = dateA.getTime() - dateB.getTime();
        const lexicographic = idA.localeCompare(idB);

        // Same sign or both zero
        if (chronological < 0) expect(lexicographic).toBeLessThan(0);
        else if (chronological > 0) expect(lexicographic).toBeGreaterThan(0);
        else expect(lexicographic).toBe(0);
      }),
    );
  });
});

describe("parseSessionMetadata", () => {
  it("GIVEN YAML front matter with the declared fields WHEN parsed THEN extracts all fields", () => {
    const expected = {
      priority: SESSION_PRIORITY.HIGH,
      git_ref: "identity/session",
      goal: "Fix session parsing",
      next_step: "Run session identity tests",
      created_at: utcFixtureInstant(0, 13, 18, 0, 0).toISOString(),
      agent_session_id: "thread-session-identity",
      specs: ["identity/spec.md"],
      files: ["identity/file.ts"],
    };
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${expected.priority}`,
      `${SESSION_FRONT_MATTER.GIT_REF}: ${expected.git_ref}`,
      `${SESSION_FRONT_MATTER.GOAL}: ${JSON.stringify(expected.goal)}`,
      `${SESSION_FRONT_MATTER.NEXT_STEP}: ${JSON.stringify(expected.next_step)}`,
      `${SESSION_FRONT_MATTER.CREATED_AT}: ${expected.created_at}`,
      `${SESSION_FRONT_MATTER.AGENT_SESSION_ID}: ${expected.agent_session_id}`,
      `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(expected.specs)}`,
      `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify(expected.files)}`,
    ], buildSessionMarkdownBody("identity metadata"));
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(expected.priority);
    expect(result.git_ref).toBe(expected.git_ref);
    expect(result.goal).toBe(expected.goal);
    expect(result.next_step).toBe(expected.next_step);
    expect(result.created_at).toBe(expected.created_at);
    expect(result.agent_session_id).toBe(expected.agent_session_id);
    expect(result.specs).toEqual(expected.specs);
    expect(result.files).toEqual(expected.files);
  });

  it("GIVEN front matter carrying keys outside the declared shape WHEN parsed THEN only declared fields are returned and no error is raised", () => {
    const gitRef = DEFAULT_GIT_DEPS_BRANCH;
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
      `${SESSION_FRONT_MATTER.GIT_REF}: ${gitRef}`,
      `${SESSION_FRONT_MATTER.GOAL}: ${JSON.stringify("Resume the work")}`,
      `${SESSION_FRONT_MATTER.NEXT_STEP}: ${JSON.stringify("Open the file")}`,
      "result: completed under the previous shape",
      "worktree: .worktrees/wt",
      "branch: feature/legacy",
      "tags: [old, shape]",
    ], buildSessionMarkdownBody("keys outside the declared shape"));
    const result = parseSessionMetadata(content) as unknown as Record<string, unknown>;

    expect(result.priority).toBe(SESSION_PRIORITY.HIGH);
    expect(result.git_ref).toBe(gitRef);
    expect(result.result).toBeUndefined();
    expect(result.worktree).toBeUndefined();
    expect(result.branch).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  it("GIVEN no front matter WHEN parsed THEN returns canonical defaults", () => {
    const result = parseSessionMetadata("# Just content");

    expect(result).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("GIVEN empty content WHEN parsed THEN returns defaults", () => {
    const result = parseSessionMetadata("");

    expect(result).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("GIVEN malformed YAML WHEN parsed THEN returns defaults gracefully", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: [invalid: yaml:`,
    ], buildSessionMarkdownBody("malformed metadata"));
    const result = parseSessionMetadata(content);

    expect(result).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("GIVEN YAML that parses to null WHEN parsed THEN returns defaults", () => {
    const content = buildSessionFrontMatterContent(["null"], buildSessionMarkdownBody("null metadata"));
    const result = parseSessionMetadata(content);

    expect(result).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("GIVEN YAML that parses to a scalar (non-object) WHEN parsed THEN returns defaults", () => {
    const content = buildSessionFrontMatterContent(["just a string"], buildSessionMarkdownBody("scalar metadata"));
    const result = parseSessionMetadata(content);

    expect(result).toEqual(DEFAULT_SESSION_METADATA);
  });

  it("GIVEN invalid priority value WHEN parsed THEN uses DEFAULT_PRIORITY", () => {
    const content = buildSessionFrontMatterContent([`${SESSION_FRONT_MATTER.PRIORITY}: critical`], "");
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
  });

  it("GIVEN front matter with ... delimiter WHEN parsed THEN extracts correctly", () => {
    const expectedPriority = SESSION_PRIORITY.LOW;
    const content = buildSessionFrontMatterContent(
      [`${SESSION_FRONT_MATTER.PRIORITY}: ${expectedPriority}`],
      buildSessionMarkdownBody("document-end delimiter"),
      SESSION_FRONT_MATTER_DELIMITER,
    );
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(expectedPriority);
  });

  it("GIVEN specs and files with non-string values WHEN parsed THEN filters them out", () => {
    const expectedSpecs = ["identity-valid.md"];
    const expectedFiles = ["src/valid.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: [${expectedSpecs[0]}, 123, true, null]`,
      `${SESSION_FRONT_MATTER.FILES}: [${expectedFiles[0]}, 456]`,
    ], "");
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(expectedSpecs);
    expect(result.files).toEqual(expectedFiles);
  });
});

describe("parseSessionMetadata properties (property-based)", () => {
  it("GIVEN any valid priority in YAML WHEN parsed THEN roundtrips correctly", () => {
    fc.assert(
      fc.property(
        arbitrarySessionPriority(),
        (priority) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.PRIORITY}: ${priority}`,
          ], buildSessionMarkdownBody("priority roundtrip"));
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(priority);
        },
      ),
    );
  });

  it("GIVEN any string not in valid priorities WHEN parsed THEN returns DEFAULT_PRIORITY", () => {
    const validSet = new Set<string>(Object.values(SESSION_PRIORITY));
    fc.assert(
      fc.property(
        fc.string().filter((s) => !validSet.has(s) && !s.includes("\n") && !s.includes(SESSION_FRONT_MATTER_DELIMITER)),
        (invalidPriority) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.PRIORITY}: ${JSON.stringify(invalidPriority)}`,
          ], buildSessionMarkdownBody("invalid priority fallback"));
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(DEFAULT_PRIORITY);
        },
      ),
    );
  });

  it("GIVEN content without frontmatter WHEN parsed THEN always returns defaults", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith(SESSION_FRONT_MATTER_DELIMITER)),
        (content) => {
          const result = parseSessionMetadata(content);
          expect(result).toEqual(DEFAULT_SESSION_METADATA);
        },
      ),
    );
  });
});
