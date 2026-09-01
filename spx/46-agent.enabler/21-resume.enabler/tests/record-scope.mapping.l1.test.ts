import { describe, expect, it } from "vitest";

import { withCodexRecordParsingEvidence } from "@testing/harnesses/agent/record-scope";

describe("Codex working-directory record mapping", () => {
  it("maps a plain-path turn-context record and a file-URI command-execution item record to recorded working directories, ignoring other rows", () => {
    withCodexRecordParsingEvidence((evidence) => {
      expect(evidence.records).toEqual([evidence.plainPathCwd, evidence.fileUriSourceCwd]);
    });
  });
});
