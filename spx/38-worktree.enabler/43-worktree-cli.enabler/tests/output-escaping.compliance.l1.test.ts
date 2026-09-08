import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { AGENT_RUNTIME_DISPLAY_NAME } from "@/domains/worktree/controlling-process";
import { DETAIL_BRANCH_SEPARATOR, DETAIL_ELBOW } from "@/lib/styled-output/styled-output";
import { renderTerminalText } from "@/lib/terminal-text/terminal-text";
import { TERMINAL_ORACLE } from "@testing/generators/terminal-text/terminal-text";
import {
  arbitraryUnsafeWorktreeRefusalCase,
  arbitraryUnsafeWorktreeStatusCase,
} from "@testing/generators/worktree/command-output";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withWorktreeStatusReport, worktreeStatusRefusal } from "@testing/harnesses/worktree/command-output";

describe("worktree status output the terminal receives is escaped", () => {
  it("emits no control byte and no DEL in a text report over an unsafe worktree path", async () => {
    await assertProperty(arbitraryUnsafeWorktreeStatusCase(), async (request) => {
      await withWorktreeStatusReport(request, (status) => {
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(renderTerminalText(status.error.text));
        const report = renderTerminalText(status.value);
        // The tree's own newlines are the product's line structure; every other byte below the
        // printable range, and DEL, entered through the worktree path and must have left escaped.
        for (const character of report.replaceAll("\n", "")) {
          expect(character.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
          expect(character.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
        }
        // The glyph and the runtime name are the product's own speech and survive composition.
        expect(report).toContain(`${DETAIL_ELBOW}${DETAIL_BRANCH_SEPARATOR}`);
        expect(report).toContain(AGENT_RUNTIME_DISPLAY_NAME[request.holderCommand]);
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("emits no control byte and no DEL in a refusal naming an unresolved target", async () => {
    await assertProperty(arbitraryUnsafeWorktreeRefusalCase(), async (request) => {
      const status = await worktreeStatusRefusal(request);

      expect(status.ok).toBe(false);
      if (status.ok) throw new Error(renderTerminalText(status.value));
      for (const character of renderTerminalText(status.error.text).replaceAll("\n", "")) {
        expect(character.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(character.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("writes the JSON status report with no control byte or DEL outside its own line structure", async () => {
    await assertProperty(arbitraryUnsafeWorktreeStatusCase(), async (request) => {
      await withWorktreeStatusReport({ ...request, format: WORKTREE_STATUS_FORMAT.JSON }, (status) => {
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(renderTerminalText(status.error.text));
        // The serializer's indentation is the product's own line structure; every other byte below
        // the printable range, and DEL, must have left as a JSON escape.
        for (const character of renderTerminalText(status.value).replaceAll("\n", "")) {
          expect(character.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
          expect(character.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
        }
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("keeps the holder's session and host verbatim in the JSON report for machine consumers", async () => {
    await assertProperty(arbitraryUnsafeWorktreeStatusCase(), async (request) => {
      await withWorktreeStatusReport({ ...request, format: WORKTREE_STATUS_FORMAT.JSON }, (status) => {
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(renderTerminalText(status.error.text));
        expect(JSON.parse(renderTerminalText(status.value))).toMatchObject({
          session: request.claim.sessionId,
          host: request.claim.host,
          pid: request.claim.pid,
        });
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
