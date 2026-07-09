/**
 * Unit tests for session store: list, show, handoff (create), and delete CRUD operations.
 *
 * Test Level: 1 (Unit)
 * - Command handlers with real temp directories (fs is Level 1)
 * - Pure functions: formatShowOutput, resolveSessionPaths, resolveDeletePath
 * - Domain error types
 *
 * Spec: 43-session-store.enabler/session-store.md
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handoffCommand } from "@/commands/session/handoff";
import { listCommand, SESSION_LIST_EMPTY_TEXT, SESSION_LIST_FORMAT } from "@/commands/session/list";
import { pickupCommand } from "@/commands/session/pickup";
import { releaseCommand } from "@/commands/session/release";
import { showCommand } from "@/commands/session/show";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { AGENT_SESSION_ENV } from "@/domains/session/agent-session";
import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { resolveDeletePath } from "@/domains/session/delete";
import {
  SessionError,
  SessionHandoffBaseError,
  SessionInjectionDirectoryError,
  SessionInvalidContentError,
  SessionInvalidFieldError,
  SessionInvalidGoalError,
  SessionInvalidJsonHeaderError,
  SessionInvalidNextStepError,
  SessionLegacyFrontmatterInputError,
  SessionNotAvailableError,
  SessionNotFoundError,
  SessionWorkBranchNotOnOriginError,
} from "@/domains/session/errors";
import { resolveWorkBranchGitRef } from "@/domains/session/handoff-base";
import { HANDOFF_BASE_PREREQUISITE_LABEL, HANDOFF_BASE_REMEDY } from "@/domains/session/handoff-base-checklist";
import {
  DEFAULT_SESSION_METADATA,
  FIELD_SELECTION_SEPARATOR,
  LIST_SUMMARY_SEPARATOR,
  parseFieldSelection,
  parseSessionMetadata,
  projectSessionRecord,
  SESSION_RECORD_FIELD,
  SESSION_RECORD_FIELDS,
  type SessionRecord,
  type SessionRecordField,
  sortSessions,
  toSessionRecord,
} from "@/domains/session/list";
import {
  DEFAULT_SESSION_CONFIG,
  formatShowOutput,
  resolveSessionPaths,
  SEARCH_ORDER,
  SESSION_SHOW_LABEL,
  SESSION_SHOW_SEPARATOR_CHAR,
} from "@/domains/session/show";
import {
  DEFAULT_LIST_STATUSES,
  DEFAULT_PRIORITY,
  type Session,
  SESSION_FILE_ENCODING,
  SESSION_FRONT_MATTER,
  SESSION_OUTPUT_MARKER,
  SESSION_PRIORITY,
  SESSION_STATUSES,
  type SessionPriority,
} from "@/domains/session/types";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";

import type { HandoffHeaderFixture } from "@testing/generators/session/session";
import {
  arbitrarySessionId,
  arbitrarySessionPriority,
  sampleDistinctSessionIds,
  sampleSessionId,
} from "@testing/generators/session/session";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  buildHandoffStdin,
  buildSessionMarkdownBody,
  createSessionGitDeps,
  createSessionHarness,
  HEAD_SHA,
  ORIGIN_DEFAULT_SHA,
  SESSION_FORBIDDEN_JSON_RECORD_FIELD,
  SessionHarness,
  WORKTREE_KIND,
} from "@testing/harnesses/session/harness";
import { extractSessionFile, extractSessionMarker, parseFrontMatter } from "@testing/harnesses/session/session-store";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const [TODO, DOING] = SESSION_STATUSES;

const envKeys = Object.values(AGENT_SESSION_ENV);
const testGoal = "Exercise session handoff";
const testNextStep = "Inspect generated session";
const prefillHandoffHeader: HandoffHeaderFixture = {
  priority: DEFAULT_PRIORITY,
  goal: testGoal,
  next_step: testNextStep,
  specs: [],
  files: [],
};
const prefillHandoffStdin = buildHandoffStdin(prefillHandoffHeader, "# Test session");
const handoffGitRef = "topic/session-frontmatter";
const handoffGitDeps = createSessionGitDeps({ branch: handoffGitRef });

function makeSession(id: string, priority: SessionPriority = DEFAULT_PRIORITY): Session {
  return {
    id,
    status: TODO,
    path: `/s/${TODO}/${id}.md`,
    metadata: {
      priority,
      git_ref: "",
      goal: "",
      next_step: "",
      specs: [],
      files: [],
    },
  };
}

function handoffStdinWithGitRef(gitRef: string): string {
  return buildHandoffStdin(
    { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [], files: [], git_ref: gitRef },
    "# Test handoff",
  );
}

async function expectHandoffBaseError(action: Promise<unknown>): Promise<SessionHandoffBaseError> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(SessionHandoffBaseError);
    if (error instanceof SessionHandoffBaseError) {
      return error;
    }
  }
  throw new Error("Expected SessionHandoffBaseError");
}

function requireHandoffBasePrerequisite(error: SessionHandoffBaseError, label: string) {
  expect(error.checklist).not.toBeNull();
  const prerequisite = error.checklist?.prerequisites.find((entry) => entry.label === label);
  expect(prerequisite).toBeDefined();
  if (prerequisite === undefined) {
    throw new Error(`Missing handoff-base prerequisite: ${label}`);
  }
  return prerequisite;
}

describe("listCommand", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // -- Default behavior (no --status) --

  describe("GIVEN sessions in all directories WHEN list invoked without --status", () => {
    it("THEN shows only DEFAULT_LIST_STATUSES, not others", async () => {
      await harness.writeSession(SESSION_STATUSES[0], "2026-01-10_10-00-00", {
        priority: SESSION_PRIORITY.LOW,
        goal: "Backlog task",
        next_step: "Wait",
      });
      await harness.writeSession(SESSION_STATUSES[1], "2026-01-11_10-00-00", {
        priority: SESSION_PRIORITY.HIGH,
        goal: "Active task",
        next_step: "Continue",
      });
      await harness.writeSession(SESSION_STATUSES[2], "2026-01-09_10-00-00");

      const output = await listCommand({ sessionsDir: harness.sessionsDir });

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(output).not.toContain(`${status.toUpperCase()}:`);
        }
      }
    });

    it("THEN default statuses appear in DEFAULT_LIST_STATUSES order", async () => {
      await harness.writeSession(SESSION_STATUSES[0], "2026-01-10_10-00-00");
      await harness.writeSession(SESSION_STATUSES[1], "2026-01-11_10-00-00");

      const output = await listCommand({ sessionsDir: harness.sessionsDir });

      let lastIndex = -1;
      for (const status of DEFAULT_LIST_STATUSES) {
        const idx = output.indexOf(`${status.toUpperCase()}:`);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    });
  });

  describe("GIVEN empty directories WHEN list invoked without --status", () => {
    it("THEN shows DEFAULT_LIST_STATUSES sections with no-sessions message", async () => {
      const output = await listCommand({ sessionsDir: harness.sessionsDir });

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
      expect(output).toContain(SESSION_LIST_EMPTY_TEXT);
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(output).not.toContain(`${status.toUpperCase()}:`);
        }
      }
    });
  });

  describe("GIVEN session omits structured fields WHEN lifecycle commands read it", () => {
    it("THEN list, show, pickup, and release tolerate missing values", async () => {
      const sessionId = "2026-01-13_10-00-00";
      const content = buildSessionFrontMatterContent([
        `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
      ], "# Sparse session");
      await writeFile(join(harness.statusDir(TODO), `${sessionId}.md`), content);

      const listed = await listCommand({ status: TODO, sessionsDir: harness.sessionsDir });
      expect(listed).toContain(sessionId);
      expect(listed).not.toContain(LIST_SUMMARY_SEPARATOR);

      const shown = formatShowOutput(content, { status: TODO });
      expect(shown).toContain(`${SESSION_SHOW_LABEL.GOAL}: `);
      expect(shown).toContain(`${SESSION_SHOW_LABEL.NEXT_STEP}: `);

      await pickupCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });
      expect(await listCommand({ status: DOING, sessionsDir: harness.sessionsDir })).toContain(sessionId);

      await releaseCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir });
      expect(await listCommand({ status: TODO, sessionsDir: harness.sessionsDir })).toContain(sessionId);
    });
  });

  // -- Explicit --status filter --

  describe("GIVEN sessions in all directories WHEN list invoked with explicit --status", () => {
    it("THEN each valid status shows only that status section", async () => {
      for (const status of SESSION_STATUSES) {
        await harness.writeSession(status, `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
      }

      for (const targetStatus of SESSION_STATUSES) {
        const output = await listCommand({ status: targetStatus, sessionsDir: harness.sessionsDir });

        expect(output).toContain(`${targetStatus.toUpperCase()}:`);
        for (const otherStatus of SESSION_STATUSES) {
          if (otherStatus !== targetStatus) {
            expect(output).not.toContain(`${otherStatus.toUpperCase()}:`);
          }
        }
      }
    });
  });

  describe("GIVEN sessions in todo WHEN list invoked with --status todo", () => {
    it("THEN sessions are sorted by priority then timestamp", async () => {
      const lowPrioritySessionId = "2026-01-10_10-00-00";
      const newestHighPrioritySessionId = "2026-01-12_10-00-00";
      const olderHighPrioritySessionId = "2026-01-11_10-00-00";
      await harness.writeSession(TODO, lowPrioritySessionId, { priority: SESSION_PRIORITY.LOW });
      await harness.writeSession(TODO, newestHighPrioritySessionId, { priority: SESSION_PRIORITY.HIGH });
      await harness.writeSession(TODO, olderHighPrioritySessionId, { priority: SESSION_PRIORITY.HIGH });

      const output = await listCommand({ status: TODO, sessionsDir: harness.sessionsDir });

      const lines = output.split("\n").filter((l) => l.trim().startsWith("2026-"));
      expect(lines[0]).toContain(newestHighPrioritySessionId);
      expect(lines[1]).toContain(olderHighPrioritySessionId);
      expect(lines[2]).toContain(lowPrioritySessionId);
    });
  });

  // -- JSON output --

  describe("GIVEN sessions WHEN list invoked with --json and no --status", () => {
    it("THEN JSON keys match DEFAULT_LIST_STATUSES only", async () => {
      for (const status of SESSION_STATUSES) {
        await harness.writeSession(status, `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
      }

      const output = await listCommand({ format: SESSION_LIST_FORMAT.JSON, sessionsDir: harness.sessionsDir });
      const parsed = JSON.parse(output);

      for (const status of DEFAULT_LIST_STATUSES) {
        expect(parsed).toHaveProperty(status);
      }
      for (const status of SESSION_STATUSES) {
        if (!DEFAULT_LIST_STATUSES.includes(status)) {
          expect(parsed).not.toHaveProperty(status);
        }
      }
    });
  });

  describe("GIVEN sessions WHEN list invoked with --json and explicit --status", () => {
    it("THEN JSON contains only the requested status key", async () => {
      for (const status of SESSION_STATUSES) {
        await harness.writeSession(status, `2026-01-${10 + SESSION_STATUSES.indexOf(status)}_10-00-00`);
      }

      for (const targetStatus of SESSION_STATUSES) {
        const output = await listCommand({
          status: targetStatus,
          format: SESSION_LIST_FORMAT.JSON,
          sessionsDir: harness.sessionsDir,
        });
        const parsed = JSON.parse(output);

        expect(parsed).toHaveProperty(targetStatus);
        for (const otherStatus of SESSION_STATUSES) {
          if (otherStatus !== targetStatus) {
            expect(parsed).not.toHaveProperty(otherStatus);
          }
        }
      }
    });
  });

  // -- Input validation (property-based) --

  describe("GIVEN valid status values WHEN list invoked", () => {
    it("THEN every member of SESSION_STATUSES is accepted", async () => {
      for (const status of SESSION_STATUSES) {
        const output = await listCommand({ status, sessionsDir: harness.sessionsDir });
        expect(output).toContain(`${status.toUpperCase()}:`);
      }
    });
  });

  describe("GIVEN invalid status value WHEN list invoked", () => {
    it("THEN arbitrary strings not in SESSION_STATUSES throw with valid values listed", async () => {
      const validSet = new Set<string>(SESSION_STATUSES);
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter((s) => !validSet.has(s)),
          async (invalidStatus) => {
            await expect(
              listCommand({ status: invalidStatus, sessionsDir: harness.sessionsDir }),
            ).rejects.toThrow(new RegExp(SESSION_STATUSES.join(".*")));
          },
        ),
      );
    });
  });

  // -- SESSION_STATUSES derivation (P3) --

  describe("GIVEN SESSION_STATUSES constant", () => {
    it("THEN contains exactly the members from DEFAULT_CONFIG.sessions.statusDirs", () => {
      const configKeys = Object.keys(DEFAULT_CONFIG.sessions.statusDirs);
      expect([...SESSION_STATUSES]).toEqual(expect.arrayContaining(configKeys));
      expect(configKeys).toEqual(expect.arrayContaining([...SESSION_STATUSES]));
    });

    it("THEN DEFAULT_LIST_STATUSES is a subset of SESSION_STATUSES", () => {
      for (const status of DEFAULT_LIST_STATUSES) {
        expect(SESSION_STATUSES).toContain(status);
      }
    });
  });

  // -- Priority and summary display --

  describe("GIVEN sessions with priorities and summaries WHEN listed", () => {
    it("THEN non-medium priorities and goal-to-next-step summaries are shown", async () => {
      const priority = SESSION_PRIORITY.HIGH;
      const goal = "Fix CI";
      const nextStep = "Run validation";
      await harness.writeSession(TODO, "2026-01-10_10-00-00", { priority, goal, next_step: nextStep });
      await harness.writeSession(TODO, "2026-01-11_10-00-00");

      const output = await listCommand({ status: TODO, sessionsDir: harness.sessionsDir });

      expect(output).toContain(`[${priority}]`);
      expect(output).toContain(`${goal}${LIST_SUMMARY_SEPARATOR}${nextStep}`);
      expect(output).not.toContain(`[${DEFAULT_PRIORITY}]`);
    });

    it("THEN sessions without summaries do not show a dangling separator", async () => {
      const danglingSessionId = "2026-01-12_10-00-00";
      await harness.writeSession(TODO, danglingSessionId, {
        goal: "",
        next_step: "",
      });

      const output = await listCommand({ status: TODO, sessionsDir: harness.sessionsDir });

      expect(output).toContain(danglingSessionId);
      expect(output).not.toContain(LIST_SUMMARY_SEPARATOR);
    });

    it("THEN sessions with partial summaries do not show a dangling separator", async () => {
      const goalOnlySessionId = "2026-01-13_10-00-00";
      const nextStepOnlySessionId = "2026-01-14_10-00-00";
      const goalOnly = "Fix CI";
      const nextStepOnly = "Run tests";
      await harness.writeSession(TODO, goalOnlySessionId, {
        goal: goalOnly,
        next_step: "",
      });
      await harness.writeSession(TODO, nextStepOnlySessionId, {
        goal: "",
        next_step: nextStepOnly,
      });

      const output = await listCommand({ status: TODO, sessionsDir: harness.sessionsDir });

      expect(output).toContain(goalOnlySessionId);
      expect(output).toContain(nextStepOnlySessionId);
      expect(output).not.toContain(`${goalOnly}${LIST_SUMMARY_SEPARATOR}`);
      expect(output).not.toContain(`${LIST_SUMMARY_SEPARATOR}${nextStepOnly}`);
    });
  });
});

// ============================================================
// Show: formatShowOutput, resolveSessionPaths
// ============================================================

describe("formatShowOutput", () => {
  it("GIVEN session content WHEN formatted THEN includes status from SESSION_STATUSES", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
    ], buildSessionMarkdownBody("show status"));

    for (const status of SESSION_STATUSES) {
      const result = formatShowOutput(content, { status });
      expect(result).toContain(`${SESSION_SHOW_LABEL.STATUS}: ${status}`);
    }
  });

  it("GIVEN session with priority WHEN formatted THEN includes priority", () => {
    const priority = SESSION_PRIORITY.HIGH;
    const content = buildSessionFrontMatterContent(
      [`${SESSION_FRONT_MATTER.PRIORITY}: ${priority}`],
      buildSessionMarkdownBody("show priority"),
    );
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${priority}`);
  });

  it("GIVEN session with full metadata WHEN formatted THEN includes all fields", () => {
    const expected = {
      priority: SESSION_PRIORITY.HIGH,
      git_ref: "topic/test",
      goal: "Fix the session display",
      nextStep: "Run display tests",
      created_at: "2026-01-13T10:00:00Z",
      agent_session_id: "thread-123",
    };
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${expected.priority}`,
      `${SESSION_FRONT_MATTER.GIT_REF}: ${expected.git_ref}`,
      `${SESSION_FRONT_MATTER.GOAL}: ${JSON.stringify(expected.goal)}`,
      `${SESSION_FRONT_MATTER.NEXT_STEP}: ${JSON.stringify(expected.nextStep)}`,
      `${SESSION_FRONT_MATTER.CREATED_AT}: ${expected.created_at}`,
      `${SESSION_FRONT_MATTER.AGENT_SESSION_ID}: ${expected.agent_session_id}`,
    ], buildSessionMarkdownBody("show metadata"));
    const result = formatShowOutput(content, { status: SESSION_STATUSES[1] });

    expect(result).toContain(`${SESSION_SHOW_LABEL.STATUS}: ${SESSION_STATUSES[1]}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${expected.priority}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.GIT_REF}: ${expected.git_ref}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.GOAL}: ${expected.goal}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.NEXT_STEP}: ${expected.nextStep}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.CREATED}: ${expected.created_at}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.AGENT_SESSION}: ${expected.agent_session_id}`);
  });

  it("GIVEN session content WHEN formatted THEN preserves original content", () => {
    const heading = "# Original Content";
    const body = "Preserved.";
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${DEFAULT_PRIORITY}`,
    ], `${heading}\n${body}`);
    const result = formatShowOutput(content, { status: SESSION_STATUSES[2] });

    expect(result).toContain(heading);
    expect(result).toContain(body);
  });

  it("GIVEN session without frontmatter WHEN formatted THEN uses defaults", () => {
    const heading = "# Just Content";
    const content = `${heading}\nNo metadata.`;
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain(`${SESSION_SHOW_LABEL.PRIORITY}: ${DEFAULT_PRIORITY}`);
    expect(result).toContain(`${SESSION_SHOW_LABEL.STATUS}: ${SESSION_STATUSES[0]}`);
    expect(result).toContain(heading);
  });

  it("GIVEN output WHEN inspected THEN has separator between metadata and content", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.LOW}`,
    ], buildSessionMarkdownBody("show separator"));
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain(SESSION_SHOW_SEPARATOR_CHAR);
  });
});

describe("resolveSessionPaths", () => {
  it("GIVEN session ID WHEN resolved THEN returns one path per SESSION_STATUSES member", () => {
    const result = resolveSessionPaths("2026-01-13_08-01-05", DEFAULT_SESSION_CONFIG);

    expect(result).toHaveLength(SESSION_STATUSES.length);
  });

  it("GIVEN result WHEN checked THEN path order matches SEARCH_ORDER", () => {
    const result = resolveSessionPaths("test-id", DEFAULT_SESSION_CONFIG);

    for (let i = 0; i < SEARCH_ORDER.length; i++) {
      expect(result[i]).toContain(SEARCH_ORDER[i]);
    }
  });
});

describe("SEARCH_ORDER", () => {
  it("GIVEN SEARCH_ORDER WHEN checked THEN contains every SESSION_STATUSES member", () => {
    for (const status of SESSION_STATUSES) {
      expect(SEARCH_ORDER).toContain(status);
    }
  });

  it("GIVEN SEARCH_ORDER WHEN checked THEN length matches SESSION_STATUSES", () => {
    expect(SEARCH_ORDER).toHaveLength(SESSION_STATUSES.length);
  });
});

describe("DEFAULT_SESSION_CONFIG", () => {
  it("GIVEN default config WHEN checked THEN all dirs contain the sessions scope base", () => {
    const sessionsBase = join(STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE);
    expect(DEFAULT_SESSION_CONFIG.todoDir).toContain(sessionsBase);
    expect(DEFAULT_SESSION_CONFIG.doingDir).toContain(sessionsBase);
    expect(DEFAULT_SESSION_CONFIG.archiveDir).toContain(sessionsBase);
  });
});

// ============================================================
// Delete: resolveDeletePath, error types
// ============================================================

describe("resolveDeletePath", () => {
  it("GIVEN session ID matching a path WHEN resolved THEN returns that path", () => {
    const existingPaths = ["/sessions/doing/2026-01-13_08-01-05.md"];
    const result = resolveDeletePath("2026-01-13_08-01-05", existingPaths);

    expect(result).toBe(existingPaths[0]);
  });

  it("GIVEN multiple matching paths WHEN resolved THEN returns first", () => {
    const existingPaths = [
      "/sessions/todo/dup.md",
      "/sessions/doing/dup.md",
    ];
    const result = resolveDeletePath("dup", existingPaths);

    expect(result).toBe(existingPaths[0]);
  });

  it("GIVEN no matching paths WHEN resolved THEN throws SessionNotFoundError", () => {
    expect(() => resolveDeletePath(sampleSessionId(), [])).toThrow(SessionNotFoundError);
  });

  it("GIVEN paths that don't match ID WHEN resolved THEN throws SessionNotFoundError", () => {
    const existingPaths = ["/sessions/todo/different-id.md"];
    expect(() => resolveDeletePath("wrong-id", existingPaths)).toThrow(SessionNotFoundError);
  });
});

describe("Session error types", () => {
  it("GIVEN SessionNotFoundError WHEN inspected THEN has session ID and descriptive message", () => {
    const sessionId = sampleSessionId();
    const error = new SessionNotFoundError(sessionId);

    expect(error.sessionId).toBe(sessionId);
    expect(error.message).toContain(sessionId);
    expect(error).toBeInstanceOf(SessionError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(SessionNotFoundError.name);
  });

  it("GIVEN SessionNotAvailableError WHEN inspected THEN has session ID", () => {
    const sessionId = "busy";
    const error = new SessionNotAvailableError(sessionId);

    expect(error.sessionId).toBe(sessionId);
    expect(error.message).toContain(sessionId);
  });

  it("GIVEN SessionInvalidContentError WHEN inspected THEN includes reason", () => {
    const reason = "missing field";
    const error = new SessionInvalidContentError(reason);

    expect(error.message).toContain(reason);
  });
});

// ============================================================
// Handoff: JSON-prefix input contract
// ============================================================

describe("handoffCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN JSON header with non-empty goal and next_step WHEN piped THEN creates file in todo with HANDOFF_ID tag", async () => {
    const stdin = buildHandoffStdin(
      {
        priority: SESSION_PRIORITY.HIGH,
        goal: testGoal,
        next_step: testNextStep,
        specs: [],
        files: [],
      },
      "# Test handoff",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });

    const handoffId = extractSessionMarker(output, SESSION_OUTPUT_MARKER.HANDOFF_ID);
    const sessionFile = extractSessionFile(output);

    expect(handoffId).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(basename(sessionFile)).toBe(`${handoffId}.md`);
    expect(sessionFile).toBe(join(harness.statusDir(TODO), `${handoffId}.md`));

    const frontMatter = parseFrontMatter(await readFile(sessionFile, SESSION_FILE_ENCODING));
    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.PRIORITY, SESSION_PRIORITY.HIGH);
    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.GIT_REF, handoffGitRef);
    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.GOAL, testGoal);
    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.NEXT_STEP, testNextStep);
  });

  it("GIVEN git output with YAML-special characters in the git ref WHEN handoff executes THEN metadata parses back unchanged", async () => {
    const gitRef = "topic/{yaml}: branch # marker";
    const deps = createSessionGitDeps({ branch: gitRef });

    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.git_ref).toBe(gitRef);
  });

  it("GIVEN JSON header followed by CRLF separator WHEN handoff executes THEN body starts after the separator", async () => {
    const body = "# CRLF-separated body";
    const stdin = `${JSON.stringify(prefillHandoffHeader)}\r\n${body}`;

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const onDisk = await readFile(extractSessionFile(output), SESSION_FILE_ENCODING);

    expect(onDisk).toContain(`${SESSION_FRONT_MATTER_DELIMITER}\n${body}`);
    expect(onDisk.endsWith(body)).toBe(true);
    expect(onDisk).not.toContain(`${SESSION_FRONT_MATTER_DELIMITER}\n${String.fromCodePoint(13)}${body}`);
  });

  it("GIVEN JSON header with YAML-significant characters in specs WHEN handoff executes THEN parsed specs round-trips unchanged", async () => {
    const specs = [">", "|", "{"];
    const stdin = buildHandoffStdin(
      { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs, files: [] },
      "# Test handoff",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.specs).toEqual(specs);
  });

  it("GIVEN JSON header with YAML-significant characters in files WHEN handoff executes THEN parsed files round-trips unchanged", async () => {
    const files = [">", "|", "{"];
    const stdin = buildHandoffStdin(
      { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [], files },
      "# Test handoff",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.files).toEqual(files);
  });

  it("GIVEN JSON header with a single empty-string entry in specs WHEN handoff executes THEN parsed specs round-trips unchanged", async () => {
    const specs = [""];
    const stdin = buildHandoffStdin(
      { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs, files: [] },
      "# Test handoff",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.specs).toEqual(specs);
  });

  it("GIVEN JSON header with a single empty-string entry in files WHEN handoff executes THEN parsed files round-trips unchanged", async () => {
    const files = [""];
    const stdin = buildHandoffStdin(
      { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [], files },
      "# Test handoff",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.files).toEqual(files);
  });

  it("GIVEN a specs entry resolving to an existing directory WHEN handoff executes THEN rejects with SessionInjectionDirectoryError naming the entry and writes no file", async () => {
    await withTempDir("spx-handoff-injection-", async (productDir) => {
      const directoryEntry = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await mkdir(join(productDir, directoryEntry), { recursive: true });
      const stdin = buildHandoffStdin(
        { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [directoryEntry], files: [] },
        "# Test handoff",
      );

      let caught: unknown;
      try {
        await handoffCommand({
          content: stdin,
          sessionsDir: harness.sessionsDir,
          cwd: productDir,
          deps: handoffGitDeps,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SessionInjectionDirectoryError);
      expect((caught as SessionInjectionDirectoryError).entry).toBe(directoryEntry);
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(0);
    });
  });

  it("GIVEN a specs entry that does not exist on disk WHEN handoff executes THEN writes the session and records the entry unchanged", async () => {
    await withTempDir("spx-handoff-injection-", async (productDir) => {
      const missingEntry = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const stdin = buildHandoffStdin(
        { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [missingEntry], files: [] },
        "# Test handoff",
      );

      const { output } = await handoffCommand({
        content: stdin,
        sessionsDir: harness.sessionsDir,
        cwd: productDir,
        deps: handoffGitDeps,
      });
      const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

      expect(metadata.specs).toEqual([missingEntry]);
    });
  });

  it("GIVEN a files entry resolving to an existing directory WHEN handoff executes THEN rejects with SessionInjectionDirectoryError naming the entry and writes no file", async () => {
    await withTempDir("spx-handoff-injection-", async (productDir) => {
      const directoryEntry = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await mkdir(join(productDir, directoryEntry), { recursive: true });
      const stdin = buildHandoffStdin(
        { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [], files: [directoryEntry] },
        "# Test handoff",
      );

      let caught: unknown;
      try {
        await handoffCommand({
          content: stdin,
          sessionsDir: harness.sessionsDir,
          cwd: productDir,
          deps: handoffGitDeps,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SessionInjectionDirectoryError);
      expect((caught as SessionInjectionDirectoryError).entry).toBe(directoryEntry);
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(0);
    });
  });

  it("GIVEN a files entry that does not exist on disk WHEN handoff executes THEN writes the session and records the entry unchanged", async () => {
    await withTempDir("spx-handoff-injection-", async (productDir) => {
      const missingEntry = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const stdin = buildHandoffStdin(
        { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [], files: [missingEntry] },
        "# Test handoff",
      );

      const { output } = await handoffCommand({
        content: stdin,
        sessionsDir: harness.sessionsDir,
        cwd: productDir,
        deps: handoffGitDeps,
      });
      const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

      expect(metadata.files).toEqual([missingEntry]);
    });
  });

  it("GIVEN a disallowed git base and a specs entry resolving to a directory WHEN handoff executes THEN the base gate rejects with SessionHandoffBaseError before the directory check", async () => {
    await withTempDir("spx-handoff-injection-", async (productDir) => {
      const directoryEntry = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await mkdir(join(productDir, directoryEntry), { recursive: true });
      const stdin = buildHandoffStdin(
        { priority: DEFAULT_PRIORITY, goal: testGoal, next_step: testNextStep, specs: [directoryEntry], files: [] },
        "# Test handoff",
      );

      let caught: unknown;
      try {
        await handoffCommand({
          content: stdin,
          sessionsDir: harness.sessionsDir,
          cwd: productDir,
          deps: createSessionGitDeps({
            worktreeKind: WORKTREE_KIND.NON_MAIN,
            branch: null,
            clean: false,
            detachedAtDefaultTip: true,
          }),
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SessionHandoffBaseError);
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(0);
    });
  });

  it("GIVEN empty stdin WHEN handoff executes THEN rejects with SessionInvalidContentError before writing", async () => {
    await expect(
      handoffCommand({ content: "", sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionInvalidContentError);
  });

  it("GIVEN whitespace-only stdin WHEN handoff executes THEN rejects with SessionInvalidContentError before writing", async () => {
    await expect(
      handoffCommand({ content: "   \n\t  ", sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionInvalidContentError);
  });

  it("GIVEN JSON header with empty goal WHEN piped THEN rejects with SessionInvalidGoalError before writing", async () => {
    const stdin = buildHandoffStdin(
      { priority: SESSION_PRIORITY.HIGH, goal: "", next_step: testNextStep, specs: [], files: [] },
      "# Test handoff",
    );

    await expect(
      handoffCommand({ content: stdin, sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionInvalidGoalError);
  });

  it("GIVEN JSON header with empty next_step WHEN piped THEN rejects with SessionInvalidNextStepError before writing", async () => {
    const stdin = buildHandoffStdin(
      { priority: SESSION_PRIORITY.HIGH, goal: testGoal, next_step: "", specs: [], files: [] },
      "# Test handoff",
    );

    await expect(
      handoffCommand({ content: stdin, sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionInvalidNextStepError);
  });

  it("GIVEN stdin opening with the YAML-frontmatter delimiter WHEN handoff executes THEN rejects with SessionLegacyFrontmatterInputError", async () => {
    const legacyYamlStdin = "---\npriority: high\ngoal: Legacy shape\nnext_step: Should reject\n---\n# Body";

    await expect(
      handoffCommand({ content: legacyYamlStdin, sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionLegacyFrontmatterInputError);
  });

  it("GIVEN JSON header that opens with `{` but is not parseable WHEN handoff executes THEN rejects with SessionInvalidJsonHeaderError", async () => {
    const malformedJsonStdin = `{"priority":"high","goal":"oops"`;

    await expect(
      handoffCommand({ content: malformedJsonStdin, sessionsDir: harness.sessionsDir, deps: handoffGitDeps }),
    ).rejects.toThrow(SessionInvalidJsonHeaderError);
  });

  // -- Bug-report regressions: caller content containing YAML-significant characters --

  it("GIVEN JSON header with `#` in goal WHEN piped THEN parsed goal equals caller-supplied string in full", async () => {
    const goalWithHash = "Finish PR #294 so validation-test CI vocabulary and behavior are reviewed, green, and ready.";
    const stdin = buildHandoffStdin(
      { priority: SESSION_PRIORITY.HIGH, goal: goalWithHash, next_step: testNextStep, specs: [], files: [] },
      "# Body",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.goal).toBe(goalWithHash);
  });

  it("GIVEN JSON header with `#` in next_step WHEN piped THEN parsed next_step equals caller-supplied string in full", async () => {
    const nextStepWithHash = "Inspect PR #294 and continue.";
    const stdin = buildHandoffStdin(
      { priority: SESSION_PRIORITY.HIGH, goal: testGoal, next_step: nextStepWithHash, specs: [], files: [] },
      "# Body",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.next_step).toBe(nextStepWithHash);
  });

  it("GIVEN JSON header with embedded colon in next_step WHEN piped THEN parsed next_step equals caller-supplied string in full", async () => {
    const nextStepWithColon = "Review: inspect checks";
    const stdin = buildHandoffStdin(
      { priority: SESSION_PRIORITY.HIGH, goal: testGoal, next_step: nextStepWithColon, specs: [], files: [] },
      "# Body",
    );

    const { output } = await handoffCommand({
      content: stdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.next_step).toBe(nextStepWithColon);
  });
});

// ============================================================
// Sort determinism with unparsable IDs
// ============================================================

describe("sortSessions with unparsable IDs", () => {
  it("GIVEN all valid IDs at same priority WHEN sorted THEN newest first", () => {
    const oldestSessionId = "2026-01-10_10-00-00";
    const newestSessionId = "2026-01-13_10-00-00";
    const middleSessionId = "2026-01-11_10-00-00";
    const sorted = sortSessions([
      makeSession(oldestSessionId),
      makeSession(newestSessionId),
      makeSession(middleSessionId),
    ]);
    expect(sorted.map((s) => s.id)).toEqual([newestSessionId, middleSessionId, oldestSessionId]);
  });

  it("GIVEN mix of valid and unparsable IDs at same priority WHEN sorted THEN unparsable last", () => {
    const unparsableSessionId = "unparsable";
    const validSessionId = "2026-01-13_10-00-00";
    const sorted = sortSessions([
      makeSession(unparsableSessionId, SESSION_PRIORITY.HIGH),
      makeSession(validSessionId, SESSION_PRIORITY.HIGH),
    ]);
    expect(sorted.map((s) => s.id)).toEqual([validSessionId, unparsableSessionId]);
  });

  it("GIVEN all unparsable IDs at same priority WHEN sorted THEN stable ordering", () => {
    const input = [makeSession("zzz"), makeSession("aaa")];
    const sorted = sortSessions(input);
    expect(sorted).toHaveLength(2);
    expect(sorted.map((s) => s.id).sort((a, b) => a.localeCompare(b)))
      .toEqual(input.map((session) => session.id).sort((a, b) => a.localeCompare(b)));
  });
});

// ============================================================
// Handoff: created_at and agent_session_id pre-fill
// ============================================================

describe("handoffCommand — created_at and agent_session_id pre-fill", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await harness.cleanup();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("GIVEN handoff is invoked WHEN session file is created THEN created_at is written to YAML front matter", async () => {
    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.CREATED_AT);
    expect(frontMatter[SESSION_FRONT_MATTER.CREATED_AT]).toEqual(expect.any(String));
  });

  it("GIVEN CLAUDE_SESSION_ID is set WHEN handoff creates session THEN agent_session_id is written with CLAUDE_SESSION_ID value", async () => {
    const agentSessionId = "fa0a91ee-f0bc-449e-8299-727ebe314a78";
    process.env.CLAUDE_SESSION_ID = agentSessionId;

    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.AGENT_SESSION_ID, agentSessionId);
  });

  it("GIVEN CLAUDE_SESSION_ID absent and CODEX_THREAD_ID set WHEN handoff creates session THEN agent_session_id is written with CODEX_THREAD_ID value", async () => {
    const threadId = "thread-xyz-789";
    process.env.CODEX_THREAD_ID = threadId;

    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(frontMatter).toHaveProperty(SESSION_FRONT_MATTER.AGENT_SESSION_ID, threadId);
  });

  it("GIVEN neither CLAUDE_SESSION_ID nor CODEX_THREAD_ID set WHEN handoff creates session THEN agent_session_id does not appear in YAML front matter", async () => {
    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const frontMatter = parseFrontMatter(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(frontMatter).not.toHaveProperty(SESSION_FRONT_MATTER.AGENT_SESSION_ID);
  });
});

describe("handoffCommand — handoff-base gate", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN the main checkout with a detached HEAD WHEN handoff executes THEN git_ref is the HEAD commit SHA", async () => {
    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: createSessionGitDeps({ branch: null }),
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.git_ref).toBe(HEAD_SHA);
  });

  it("GIVEN a linked worktree clean and detached at origin/<default> WHEN handoff executes THEN git_ref is that commit SHA", async () => {
    const { output } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: createSessionGitDeps({
        worktreeKind: WORKTREE_KIND.NON_MAIN,
        branch: null,
        clean: true,
        detachedAtDefaultTip: true,
      }),
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.git_ref).toBe(ORIGIN_DEFAULT_SHA);
  });

  it("GIVEN a linked worktree with a dirty working tree WHEN handoff executes THEN rejects without writing and names the commit-before-handoff remedy", async () => {
    const error = await expectHandoffBaseError(
      handoffCommand({
        content: prefillHandoffStdin,
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({
          worktreeKind: WORKTREE_KIND.NON_MAIN,
          branch: null,
          clean: false,
          detachedAtDefaultTip: true,
        }),
      }),
    );
    const cleanPrerequisite = requireHandoffBasePrerequisite(
      error,
      HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE,
    );

    expect(await readdir(harness.statusDir(TODO))).toHaveLength(0);
    expect(cleanPrerequisite.met).toBe(false);
    expect(cleanPrerequisite.remedy).toBe(HANDOFF_BASE_REMEDY.COMMIT_BEFORE_HANDOFF);
    expect(cleanPrerequisite.remedy).not.toBe(HANDOFF_BASE_REMEDY.MAIN_CHECKOUT_ONLY);
    expect(cleanPrerequisite.remedy).not.toBe(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT);
  });

  it("GIVEN a linked worktree on a worktree-local branch WHEN handoff executes THEN rejects with SessionHandoffBaseError", async () => {
    await expect(
      handoffCommand({
        content: prefillHandoffStdin,
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN, branch: "feature/local", clean: true }),
      }),
    ).rejects.toBeInstanceOf(SessionHandoffBaseError);
  });

  it("GIVEN a linked worktree detached at a commit other than origin/<default> WHEN handoff executes THEN rejects without writing and names the detach-or-main remedy", async () => {
    const error = await expectHandoffBaseError(
      handoffCommand({
        content: prefillHandoffStdin,
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({
          worktreeKind: WORKTREE_KIND.NON_MAIN,
          branch: null,
          clean: true,
          detachedAtDefaultTip: false,
        }),
      }),
    );
    const detachedAtTipPrerequisite = requireHandoffBasePrerequisite(
      error,
      HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP,
    );

    expect(await readdir(harness.statusDir(TODO))).toHaveLength(0);
    expect(detachedAtTipPrerequisite.met).toBe(false);
    expect(detachedAtTipPrerequisite.remedy).toBe(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT);
  });
});

// ============================================================
// Handoff: explicit work-branch ref (verified on origin)
// ============================================================

describe("resolveWorkBranchGitRef (explicit work-branch ref)", () => {
  const WORK_BRANCH = "feat/explicit-work-branch-ref";

  it("GIVEN the supplied ref exists on origin THEN returns the ref unchanged", () => {
    expect(resolveWorkBranchGitRef(WORK_BRANCH, true)).toBe(WORK_BRANCH);
  });

  it("GIVEN the supplied ref does not exist on origin THEN throws SessionWorkBranchNotOnOriginError naming the ref", () => {
    let caught: unknown;
    try {
      resolveWorkBranchGitRef(WORK_BRANCH, false);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SessionWorkBranchNotOnOriginError);
    expect((caught as SessionWorkBranchNotOnOriginError).workBranch).toBe(WORK_BRANCH);
    expect((caught as SessionWorkBranchNotOnOriginError).message).toContain(WORK_BRANCH);
  });
});

describe("handoffCommand — explicit work-branch ref", () => {
  const WORK_BRANCH = "feat/explicit-work-branch-ref";
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  async function todoFileCount(): Promise<number> {
    return (await readdir(harness.statusDir(TODO))).length;
  }

  it("GIVEN a header git_ref that exists on origin from a permitted base WHEN handoff executes THEN git_ref is the supplied work-branch ref, overriding the derived base", async () => {
    const { output } = await handoffCommand({
      content: handoffStdinWithGitRef(WORK_BRANCH),
      sessionsDir: harness.sessionsDir,
      deps: createSessionGitDeps({ originWorkBranches: [WORK_BRANCH] }),
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.git_ref).toBe(WORK_BRANCH);
  });

  it("GIVEN an empty-string header git_ref WHEN handoff executes from a permitted base THEN git_ref is the gate-derived base, treating empty as no ref", async () => {
    // A distinct main-checkout branch so the recorded ref proves the gate path,
    // not the harness default. No originWorkBranches: an origin probe for the
    // empty ref would resolve nothing, so a probe would reject — recording the
    // branch instead proves the empty ref short-circuited to the gate base.
    const gateBranch = "topic/empty-ref-gate-base";
    const { output } = await handoffCommand({
      content: handoffStdinWithGitRef(""),
      sessionsDir: harness.sessionsDir,
      deps: createSessionGitDeps({ branch: gateBranch }),
    });
    const metadata = parseSessionMetadata(await readFile(extractSessionFile(output), SESSION_FILE_ENCODING));

    expect(metadata.git_ref).toBe(gateBranch);
  });

  it("GIVEN a header git_ref that does not exist on origin WHEN handoff executes THEN rejects with SessionWorkBranchNotOnOriginError before writing", async () => {
    await expect(
      handoffCommand({
        content: handoffStdinWithGitRef(WORK_BRANCH),
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({ originWorkBranches: [] }),
      }),
    ).rejects.toBeInstanceOf(SessionWorkBranchNotOnOriginError);
    expect(await todoFileCount()).toBe(0);
  });

  it("GIVEN a header git_ref that is a revision expression on an existing branch WHEN handoff executes THEN rejects — only an exact remote branch is accepted, not a resolvable revision", async () => {
    // `feat/...~1` resolves via rev-parse against the existing branch tip, but it
    // is not an exact remote-tracking ref. The exact-ref check must reject it even
    // though the base branch exists on origin.
    await expect(
      handoffCommand({
        content: handoffStdinWithGitRef(`${WORK_BRANCH}~1`),
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({ originWorkBranches: [WORK_BRANCH] }),
      }),
    ).rejects.toBeInstanceOf(SessionWorkBranchNotOnOriginError);
    expect(await todoFileCount()).toBe(0);
  });

  it("GIVEN a header git_ref of HEAD WHEN handoff executes THEN rejects — origin/HEAD is the symbolic default pointer, not a work branch", async () => {
    // `refs/remotes/origin/HEAD` exists in any clone, so an exact-ref existence
    // check alone would accept the literal "HEAD" a detached worktree's
    // `rev-parse --abbrev-ref HEAD` yields. It must be refused as a non-branch.
    await expect(
      handoffCommand({
        content: handoffStdinWithGitRef(GIT_ROOT_COMMAND.HEAD),
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps(),
      }),
    ).rejects.toBeInstanceOf(SessionWorkBranchNotOnOriginError);
    expect(await todoFileCount()).toBe(0);
  });

  it("GIVEN a header git_ref that exists on origin but a dirty linked worktree WHEN handoff executes THEN rejects with SessionHandoffBaseError — the ref does not bypass the gate", async () => {
    await expect(
      handoffCommand({
        content: handoffStdinWithGitRef(WORK_BRANCH),
        sessionsDir: harness.sessionsDir,
        deps: createSessionGitDeps({
          worktreeKind: WORKTREE_KIND.NON_MAIN,
          branch: null,
          clean: false,
          detachedAtDefaultTip: true,
          originWorkBranches: [WORK_BRANCH],
        }),
      }),
    ).rejects.toBeInstanceOf(SessionHandoffBaseError);
    expect(await todoFileCount()).toBe(0);
  });
});

// ============================================================
// Session record: flat shape, field projection, selection parsing
// ============================================================

describe("toSessionRecord", () => {
  it("flattens a session to id + status plus metadata fields, excluding the path", () => {
    fc.assert(
      fc.property(arbitrarySessionId(), arbitrarySessionPriority(), (id, priority) => {
        const record = toSessionRecord({
          id,
          status: TODO,
          path: id,
          metadata: { ...DEFAULT_SESSION_METADATA, priority },
        });

        expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.PATH);
        expect(record.id).toBe(id);
        expect(record.status).toBe(TODO);
        expect(record.priority).toBe(priority);
        for (
          const field of [
            SESSION_RECORD_FIELD.GIT_REF,
            SESSION_RECORD_FIELD.GOAL,
            SESSION_RECORD_FIELD.NEXT_STEP,
            SESSION_RECORD_FIELD.SPECS,
            SESSION_RECORD_FIELD.FILES,
          ]
        ) {
          expect(record).toHaveProperty(field);
        }
        expect(record).not.toHaveProperty(SESSION_RECORD_FIELD.CREATED_AT);
        expect(record).not.toHaveProperty(SESSION_RECORD_FIELD.AGENT_SESSION_ID);
      }),
    );
  });
});

describe("projectSessionRecord", () => {
  it("emits exactly the selected fields in the selected order", () => {
    fc.assert(
      fc.property(
        arbitrarySessionId(),
        arbitrarySessionPriority(),
        arbitrarySessionId(),
        fc.shuffledSubarray([...SESSION_RECORD_FIELDS], { minLength: 1 }),
        (id, priority, agentSessionId, selection) => {
          const record: SessionRecord = toSessionRecord({
            id,
            status: TODO,
            path: id,
            metadata: {
              ...DEFAULT_SESSION_METADATA,
              priority,
              created_at: id,
              agent_session_id: agentSessionId,
            },
          });

          const projected = projectSessionRecord(record, selection);

          expect(Object.keys(projected)).toEqual(selection);
        },
      ),
    );
  });

  it("projecting over the full field set reproduces the full record's keys in order", () => {
    fc.assert(
      fc.property(
        arbitrarySessionId(),
        arbitrarySessionPriority(),
        arbitrarySessionId(),
        (id, priority, agentSessionId) => {
          const record = toSessionRecord({
            id,
            status: TODO,
            path: id,
            metadata: {
              ...DEFAULT_SESSION_METADATA,
              priority,
              created_at: id,
              agent_session_id: agentSessionId,
            },
          });

          const projected = projectSessionRecord(record, SESSION_RECORD_FIELDS);

          expect(Object.keys(projected)).toEqual(Object.keys(record));
          expect(projected).toEqual(record);
          // JSON.stringify is key-order-sensitive, so this also pins the order.
          expect(JSON.stringify(projected)).toBe(JSON.stringify(record));
        },
      ),
    );
  });

  it("omits selected fields a sparse record does not carry", () => {
    fc.assert(
      fc.property(arbitrarySessionId(), arbitrarySessionPriority(), (id, priority) => {
        // A record with neither optional field present.
        const record = toSessionRecord({
          id,
          status: TODO,
          path: id,
          metadata: { ...DEFAULT_SESSION_METADATA, priority },
        });

        // Selecting every field — including the two absent optionals — skips the
        // absent ones, so the projection equals the sparse record exactly.
        const projected = projectSessionRecord(record, SESSION_RECORD_FIELDS);

        expect(Object.keys(projected)).toEqual(Object.keys(record));
        expect(projected).toEqual(record);
        expect(projected).not.toHaveProperty(SESSION_RECORD_FIELD.CREATED_AT);
        expect(projected).not.toHaveProperty(SESSION_RECORD_FIELD.AGENT_SESSION_ID);
      }),
    );
  });
});

describe("parseFieldSelection", () => {
  it("accepts every registered field name and preserves selection order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...SESSION_RECORD_FIELDS], { minLength: 1 }), (selection) => {
        expect(parseFieldSelection(selection.join(","))).toEqual(selection);
      }),
    );
  });

  it("rejects a token outside the field set, naming it and the valid field set", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((token) =>
          !token.includes(",") && token.trim().length > 0
          && !(SESSION_RECORD_FIELDS as readonly string[]).includes(token.trim())
        ),
        (token) => {
          let thrown: unknown;
          try {
            parseFieldSelection(token);
          } catch (error) {
            thrown = error;
          }

          expect(thrown).toBeInstanceOf(SessionInvalidFieldError);
          const message = (thrown as Error).message;
          expect(message).toContain(token.trim());
          for (const field of SESSION_RECORD_FIELDS) {
            expect(message).toContain(field);
          }
        },
      ),
    );
  });

  it("rejects a selection that names no field (empty or only separators), listing the valid field set", () => {
    const expectNoFieldRejection = (input: string): void => {
      let thrown: unknown;
      try {
        parseFieldSelection(input);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(SessionInvalidFieldError);
      expect((thrown as SessionInvalidFieldError).field).toBe(input);
      for (const field of SESSION_RECORD_FIELDS) {
        expect((thrown as Error).message).toContain(field);
      }
    };

    expectNoFieldRejection("");
    // Strings of only whitespace and/or separators name no field: each segment
    // trims to empty and is filtered out, leaving an empty selection.
    fc.assert(
      fc.property(fc.stringMatching(/^[\s,]+$/), (separatorsOnly) => {
        expectNoFieldRejection(separatorsOnly);
      }),
    );
  });

  it("rejects a selection mixing a valid field with an unknown token, naming the unknown token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SESSION_RECORD_FIELDS),
        fc.string({ minLength: 1 }).filter((token) =>
          !token.includes(FIELD_SELECTION_SEPARATOR) && token.trim().length > 0
          && !(SESSION_RECORD_FIELDS as readonly string[]).includes(token.trim())
        ),
        (validField, invalidToken) => {
          let thrown: unknown;
          try {
            parseFieldSelection(`${validField}${FIELD_SELECTION_SEPARATOR}${invalidToken}`);
          } catch (error) {
            thrown = error;
          }

          expect(thrown).toBeInstanceOf(SessionInvalidFieldError);
          expect((thrown as Error).message).toContain(invalidToken.trim());
        },
      ),
    );
  });
});

describe("listCommand JSON records and field projection", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await harness.cleanup();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("emits flat per-session records keyed by status, without a path or metadata nesting", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    await harness.writeSession(DOING, id);

    // No status filter: the default lists both active statuses, keyed by status directory.
    const output = await listCommand({
      format: SESSION_LIST_FORMAT.JSON,
      sessionsDir: harness.sessionsDir,
    });
    const parsed = JSON.parse(output) as Record<string, Array<Record<string, unknown>>>;

    for (const status of [TODO, DOING]) {
      const records = parsed[status];
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.status).toBe(status);
        expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.PATH);
        expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.METADATA);
        for (
          const field of [
            SESSION_RECORD_FIELD.ID,
            SESSION_RECORD_FIELD.STATUS,
            SESSION_RECORD_FIELD.PRIORITY,
            SESSION_RECORD_FIELD.GIT_REF,
            SESSION_RECORD_FIELD.GOAL,
            SESSION_RECORD_FIELD.NEXT_STEP,
            SESSION_RECORD_FIELD.SPECS,
            SESSION_RECORD_FIELD.FILES,
          ]
        ) {
          expect(record).toHaveProperty(field);
        }
      }
    }
  });

  it("carries created_at and agent_session_id only when the session frontmatter holds them", async () => {
    const agentSessionId = sampleSessionId();
    process.env.CLAUDE_SESSION_ID = agentSessionId;
    const { output: handoffOutput } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const carriedId = extractSessionFile(handoffOutput).split("/").pop()!.replace(".md", "");

    const bareId = sampleSessionId();
    await harness.writeSession(TODO, bareId);

    const output = await listCommand({
      status: TODO,
      format: SESSION_LIST_FORMAT.JSON,
      sessionsDir: harness.sessionsDir,
    });
    const records = (JSON.parse(output) as Record<string, Array<Record<string, unknown>>>)[TODO];
    const carried = records.find((record) => record.id === carriedId);
    const bare = records.find((record) => record.id === bareId);

    expect(carried).toBeDefined();
    expect(bare).toBeDefined();
    expect(carried?.[SESSION_RECORD_FIELD.AGENT_SESSION_ID]).toBe(agentSessionId);
    expect(carried?.[SESSION_RECORD_FIELD.CREATED_AT]).toEqual(expect.any(String));
    expect(bare).not.toHaveProperty(SESSION_RECORD_FIELD.CREATED_AT);
    expect(bare).not.toHaveProperty(SESSION_RECORD_FIELD.AGENT_SESSION_ID);
  });

  it("projects a --fields selection to exactly the named fields and implies JSON output", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const selection: SessionRecordField[] = [
      SESSION_RECORD_FIELD.ID,
      SESSION_RECORD_FIELD.PRIORITY,
      SESSION_RECORD_FIELD.GOAL,
      SESSION_RECORD_FIELD.NEXT_STEP,
      SESSION_RECORD_FIELD.GIT_REF,
    ];

    // No explicit format flag — a field selection implies JSON output.
    const output = await listCommand({
      status: TODO,
      fields: selection.join(","),
      sessionsDir: harness.sessionsDir,
    });
    const parsed = JSON.parse(output) as Record<string, Array<Record<string, unknown>>>;

    expect(Object.keys(parsed[TODO][0])).toEqual(selection);
  });

  it("rejects an unknown --fields token with SessionInvalidFieldError", async () => {
    await expect(
      listCommand({
        fields: sampleSessionId(),
        sessionsDir: harness.sessionsDir,
      }),
    ).rejects.toBeInstanceOf(SessionInvalidFieldError);
  });
});

describe("showCommand JSON output", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await harness.cleanup();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  // The exact key set a session with no optional frontmatter projects to. Asserting
  // equality (not mere presence) proves the JSON record carries no session body, no
  // `path`, and no `metadata` nesting — any smuggled extra key breaks the match.
  const bareRecordKeys: SessionRecordField[] = [
    SESSION_RECORD_FIELD.ID,
    SESSION_RECORD_FIELD.STATUS,
    SESSION_RECORD_FIELD.PRIORITY,
    SESSION_RECORD_FIELD.GIT_REF,
    SESSION_RECORD_FIELD.GOAL,
    SESSION_RECORD_FIELD.NEXT_STEP,
    SESSION_RECORD_FIELD.SPECS,
    SESSION_RECORD_FIELD.FILES,
  ];

  it("GIVEN a single session WHEN show invoked with JSON format THEN the output is that session's bare flat record", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const output = await showCommand({
      sessionIds: [id],
      sessionsDir: harness.sessionsDir,
      format: SESSION_LIST_FORMAT.JSON,
    });
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed[SESSION_RECORD_FIELD.ID]).toBe(id);
    expect(parsed[SESSION_RECORD_FIELD.STATUS]).toBe(TODO);
    expect(Object.keys(parsed)).toEqual(bareRecordKeys);
  });

  it("GIVEN several sessions WHEN show invoked with JSON format THEN the output is a JSON array of records in supplied order", async () => {
    const ids = [...sampleDistinctSessionIds(3)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const output = await showCommand({
      sessionIds: ids,
      sessionsDir: harness.sessionsDir,
      format: SESSION_LIST_FORMAT.JSON,
    });
    const parsed = JSON.parse(output) as Array<Record<string, unknown>>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.map((record) => record[SESSION_RECORD_FIELD.ID])).toEqual(ids);
    for (const record of parsed) {
      expect(Object.keys(record)).toEqual(bareRecordKeys);
    }
  });

  it("GIVEN a session carrying created_at and agent_session_id WHEN shown as JSON THEN both appear; a bare session omits them", async () => {
    const agentSessionId = sampleSessionId();
    process.env.CLAUDE_SESSION_ID = agentSessionId;
    const { output: handoffOutput } = await handoffCommand({
      content: prefillHandoffStdin,
      sessionsDir: harness.sessionsDir,
      deps: handoffGitDeps,
    });
    const carriedId = extractSessionFile(handoffOutput).split("/").pop()!.replace(".md", "");

    const bareId = sampleSessionId();
    await harness.writeSession(TODO, bareId);

    const carried = JSON.parse(
      await showCommand({
        sessionIds: [carriedId],
        sessionsDir: harness.sessionsDir,
        format: SESSION_LIST_FORMAT.JSON,
      }),
    ) as Record<string, unknown>;
    const bare = JSON.parse(
      await showCommand({ sessionIds: [bareId], sessionsDir: harness.sessionsDir, format: SESSION_LIST_FORMAT.JSON }),
    ) as Record<string, unknown>;

    expect(carried[SESSION_RECORD_FIELD.AGENT_SESSION_ID]).toBe(agentSessionId);
    expect(carried[SESSION_RECORD_FIELD.CREATED_AT]).toEqual(expect.any(String));
    expect(bare).not.toHaveProperty(SESSION_RECORD_FIELD.CREATED_AT);
    expect(bare).not.toHaveProperty(SESSION_RECORD_FIELD.AGENT_SESSION_ID);
  });

  it("GIVEN an unresolvable id WHEN show invoked with JSON format THEN it rejects naming the id before emitting JSON", async () => {
    const absentId = sampleSessionId();

    await expect(
      showCommand({
        sessionIds: [absentId],
        sessionsDir: harness.sessionsDir,
        format: SESSION_LIST_FORMAT.JSON,
      }),
    ).rejects.toThrow(absentId);
  });

  it("GIVEN several ids with one unresolvable WHEN show invoked with JSON format THEN it processes both and rejects naming the absent id", async () => {
    // A resolvable id alongside an absent one drives the collect-then-throw path:
    // the present id resolves into the record set while the absent id records a
    // failure, so the raised error names the absent id and no partial JSON is
    // emitted. The two ids must be distinct, so draw them from the distinct-id
    // generator rather than two same-seed samples.
    const [presentId, absentId] = sampleDistinctSessionIds(2);
    await harness.writeSession(TODO, presentId);

    await expect(
      showCommand({
        sessionIds: [presentId, absentId],
        sessionsDir: harness.sessionsDir,
        format: SESSION_LIST_FORMAT.JSON,
      }),
    ).rejects.toThrow(absentId);
  });
});
