import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { arbitraryDraftKind, retiredChangeInvocations } from "@testing/generators/change-drafts";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import {
  PROPERTY_LEVEL,
  PROPERTY_TEST_ENVELOPE_MARGIN_MS,
  PROPERTY_TIMEOUTS_MS,
} from "@testing/harnesses/property/property";

describe("packaged draft commands", () => {
  const { name, operations, kindOption } = DRAFT_COMMAND;

  it("no-standard-input: create, list, and delete finish while standard input stays open", async () => {
    await withChangeDraftEnv(async (env) => {
      const kind = sampleGeneratedValue(arbitraryDraftKind());
      const created = await env.runPackagedCliWithOpenStdin([name, operations.create, kindOption, kind]);
      expect(created.timedOut).toBe(false);
      expect(created.status, created.stderr).toBe(0);
      const draftId = JSON.parse(created.stdout).draftId as string;
      const listed = await env.runPackagedCliWithOpenStdin([name, operations.list]);
      expect(listed.timedOut).toBe(false);
      expect(listed.status, listed.stderr).toBe(0);
      const deleted = await env.runPackagedCliWithOpenStdin([name, operations.delete, kindOption, kind, draftId]);
      expect(deleted.timedOut).toBe(false);
      expect(deleted.status, deleted.stderr).toBe(0);
    });
  }, PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2] + PROPERTY_TEST_ENVELOPE_MARGIN_MS);

  it("change-group-retired: spx change and spx change draft fail as unknown commands", async () => {
    await withChangeDraftEnv(async (env) => {
      for (const args of retiredChangeInvocations()) {
        const result = env.runPackagedCli(args);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/unknown command/u);
      }
    });
  }, PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2] + PROPERTY_TEST_ENVELOPE_MARGIN_MS);
});
