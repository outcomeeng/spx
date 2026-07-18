import { describe, expect, it } from "vitest";

import { HOOK_ENV_FILE, HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import {
  normalizedSessionId,
  withClaudePrecedenceSessionStartIdentityEvidence,
  withCodexSessionStartIdentityEvidence,
  withPayloadPrecedenceSessionStartIdentityEvidence,
  withPiSessionStartIdentityEvidence,
  withUnsafePayloadSessionStartIdentityEvidence,
  withWhitespaceClaudeSessionStartIdentityEvidence,
} from "@testing/harnesses/hooks/session-start";

describe("hook session-start session identity", () => {
  it("uses CODEX_THREAD_ID when the hook payload has no session id", async () => {
    await withCodexSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.codexSessionId);
      expect(evidence.result.value.claimed).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${evidence.codexSessionId}`,
      );
    });
  });

  it("normalizes a path-unsafe payload session id before exporting it", async () => {
    await withUnsafePayloadSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(normalizedSessionId(evidence.payloadSessionId));
      expect(evidence.result.value.claimed).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${
          normalizedSessionId(
            evidence.payloadSessionId,
          )
        }`,
      );
    });
  });

  it("uses CLAUDE_SESSION_ID before CODEX_THREAD_ID when both env values exist", async () => {
    await withClaudePrecedenceSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.claudeSessionId);
      expect(evidence.result.value.claimed).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${evidence.claudeSessionId}`,
      );
    });
  });

  it("uses CODEX_THREAD_ID when CLAUDE_SESSION_ID contains only whitespace", async () => {
    await withWhitespaceClaudeSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.codexSessionId);
      expect(evidence.result.value.claimed).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${evidence.codexSessionId}`,
      );
    });
  });

  it("uses the hook payload session id before CLAUDE_SESSION_ID when both exist", async () => {
    await withPayloadPrecedenceSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.payloadSessionId);
      expect(evidence.result.value.claimed).toBe(true);
      expect(evidence.envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${evidence.payloadSessionId}`,
      );
    });
  });

  it("uses the exact Pi transcript header as the native session identity", async () => {
    await withPiSessionStartIdentityEvidence((evidence) => {
      expect(evidence.result.ok).toBe(true);
      if (!evidence.result.ok) throw new Error(evidence.result.error);
      expect(evidence.result.value.sessionId).toBe(evidence.sessionId);
      expect(evidence.result.value.claimed).toBe(true);
    });
  });
});
