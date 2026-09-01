import { describe, expect, it } from "vitest";

import { AGENT_SESSION_ROW_TYPE, CODEX_TRANSCRIPT_ITEM_TYPE } from "@/domains/agent/protocol";
import { withCodexCapturedRecordEvidence, withCodexRecordParsingEvidence } from "@testing/harnesses/agent/record-scope";

describe("Codex working-directory record mapping", () => {
  it("maps a plain-path turn-context record and a file-URI command-execution item record to recorded working directories, ignoring other rows", () => {
    withCodexRecordParsingEvidence((evidence) => {
      expect(evidence.records).toEqual([evidence.plainPathCwd, evidence.fileUriSourceCwd]);
      expect(evidence.records).not.toContain(evidence.nonCommandItemCwd);
    });
  });

  it("finds the production discriminator vocabulary in the captured Codex transcript sample and extracts records from it", async () => {
    await withCodexCapturedRecordEvidence((evidence) => {
      expect(evidence.rowTypes).toContain(AGENT_SESSION_ROW_TYPE.CODEX_TURN_CONTEXT);
      expect(evidence.itemTypes).toContain(CODEX_TRANSCRIPT_ITEM_TYPE.COMMAND_EXECUTION);
      expect(evidence.records.length).toBeGreaterThan(0);
    });
  });
});
