import { describe, expect, it } from "vitest";

import { NODE_STATUS_AUDIT_FILE_KEY, NODE_STATUS_AUDIT_FINDING_KEY } from "@/lib/node-status";
import { compareAsciiStrings } from "@/lib/state-store";
import { AUDIT_FILE_KEY_STATEMENT, AUDIT_FINDING_KEY_STATEMENT } from "@testing/generators/node-status/audit-file";

describe("the Audit File vocabulary the node-status library surface exports", () => {
  it("names exactly the seven Audit File keys", () => {
    expect([...Object.values(NODE_STATUS_AUDIT_FILE_KEY)].sort(compareAsciiStrings)).toEqual(
      [...AUDIT_FILE_KEY_STATEMENT].sort(compareAsciiStrings),
    );
  });

  it("names exactly the seven finding keys", () => {
    expect([...Object.values(NODE_STATUS_AUDIT_FINDING_KEY)].sort(compareAsciiStrings)).toEqual(
      [...AUDIT_FINDING_KEY_STATEMENT].sort(compareAsciiStrings),
    );
  });
});
