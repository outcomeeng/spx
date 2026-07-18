import {
  AGENT_PERMISSION_MODES,
  DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
  observeConfiguredDocumentationSync,
  observeDefaultDocumentationSync,
  observeFirstReleaseDocumentationSync,
  observeVersionlessSubsequentReleaseDocumentationSync,
} from "@testing/harnesses/release/documentation-sync";
import { describe, expect, it } from "vitest";

describe("documentation sync scenarios", () => {
  it("updates the default product README to the released version", async () => {
    await expect(observeDefaultDocumentationSync()).resolves.toSatisfy(
      ({ actual, expected }) => {
        expect(actual).toEqual(expected);
        return true;
      },
    );
  });

  it("updates every configured documentation path to the released version", async () => {
    await expect(observeConfiguredDocumentationSync()).resolves.toSatisfy(
      ({ actual, expected }) => {
        expect(actual).toEqual(expected);
        return true;
      },
    );
  });

  it("adds the released version to first-release documentation", async () => {
    await expect(observeFirstReleaseDocumentationSync()).resolves.toSatisfy(
      ({ actual, expected }) => {
        expect(actual).toEqual(expected);
        return true;
      },
    );
  });

  it("adds the released version when subsequent-release documentation has no previous version reference", async () => {
    await expect(observeVersionlessSubsequentReleaseDocumentationSync()).resolves.toSatisfy(
      (observation) => {
        expect(observation.producerInstruction).toContain(observation.encodedVersion.slice(1, -1));
        expect(observation.producerInstruction).not.toContain(observation.encodedVersion);
        expect(observation.permissionMode).toBe(AGENT_PERMISSION_MODES.DONT_ASK);
        expect(observation.auditRequestCount).toBe(1);
        expect(observation.auditInstruction).toContain(DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION);
        expect(observation.actual).toEqual(observation.expected);
        return true;
      },
    );
  });
});
