/**
 * Unit tests for session delete path resolution and error types.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: resolveDeletePath
 * - Domain error types
 *
 * Assertion covered from core-operations.md:
 * - S6: delete removes session file (path resolution part)
 */

import { describe, expect, it } from "vitest";

import { resolveDeletePath } from "@/session/delete";
import {
  SessionError,
  SessionInvalidContentError,
  SessionNotAvailableError,
  SessionNotFoundError,
} from "@/session/errors";

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
    expect(() => resolveDeletePath("nonexistent", [])).toThrow(SessionNotFoundError);
  });

  it("GIVEN paths that don't match ID WHEN resolved THEN throws SessionNotFoundError", () => {
    const existingPaths = ["/sessions/todo/different-id.md"];
    expect(() => resolveDeletePath("wrong-id", existingPaths)).toThrow(SessionNotFoundError);
  });
});

describe("Session error types", () => {
  it("GIVEN SessionNotFoundError WHEN inspected THEN has session ID and descriptive message", () => {
    const error = new SessionNotFoundError("test-id");

    expect(error.sessionId).toBe("test-id");
    expect(error.message).toContain("test-id");
    expect(error.message).toContain("not found");
    expect(error).toBeInstanceOf(SessionError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SessionNotFoundError");
  });

  it("GIVEN SessionNotAvailableError WHEN inspected THEN has session ID", () => {
    const error = new SessionNotAvailableError("busy");

    expect(error.sessionId).toBe("busy");
    expect(error.message).toContain("not available");
  });

  it("GIVEN SessionInvalidContentError WHEN inspected THEN includes reason", () => {
    const error = new SessionInvalidContentError("missing field");

    expect(error.message).toContain("missing field");
  });
});
