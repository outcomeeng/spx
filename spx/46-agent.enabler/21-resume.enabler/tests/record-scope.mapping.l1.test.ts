import { describe, expect, it } from "vitest";

import { withCodexCapturedRecordEvidence, withCodexRecordParsingEvidence } from "@testing/harnesses/agent/record-scope";

describe("Codex working-directory record mapping", () => {
  it("maps a plain-path turn-context record and a file-URI command-execution item record to recorded working directories, ignoring other rows", () => {
    withCodexRecordParsingEvidence((evidence) => {
      expect(evidence.records).toEqual([evidence.plainPathCwd, evidence.fileUriSourceCwd]);
      expect(evidence.records).not.toContain(evidence.nonCommandItemCwd);
    });
  });

  it("decodes the captured Codex transcript sample, proving the discriminator vocabulary against the real wire format", async () => {
    await withCodexCapturedRecordEvidence((evidence) => {
      expect(evidence.records).toEqual(evidence.expectedWorkingDirs);
    });
  });
});
