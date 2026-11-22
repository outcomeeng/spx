import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { DRAFT_LISTING_SCENARIO } from "@testing/fixtures/drafts/listing-scenario";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";

interface Draft {
  readonly kind: string;
  readonly draftId: string;
}

function identity(draft: Draft): string {
  return [draft.kind, draft.draftId].join(DRAFT_COMMAND.identitySeparator);
}

function identities(stdout: string): string[] {
  return (JSON.parse(stdout) as Draft[]).map(identity);
}

describe("draft listing and absent deletion scenarios", () => {
  const { name, operations, kindOption, allOption } = DRAFT_COMMAND;
  const { first, second, third, absent } = DRAFT_LISTING_SCENARIO;

  it("default-list-newest-first: spx draft list emits all three drafts newest first", async () => {
    await withChangeDraftEnv(async (env) => {
      for (const draft of [first, second, third]) await env.placeDraft(draft.kind, draft.draftId);
      const result = await env.runCli([name, operations.list]);
      expect(result.status, result.stderr).toBe(0);
      expect(identities(result.stdout)).toEqual([third, second, first].map(identity));
    });
  });

  it("kind-list-newest-first: spx draft list --kind change --all emits the two change drafts newest first", async () => {
    await withChangeDraftEnv(async (env) => {
      for (const draft of [first, second, third]) await env.placeDraft(draft.kind, draft.draftId);
      const result = await env.runCli([name, operations.list, kindOption, first.kind, allOption]);
      expect(result.status, result.stderr).toBe(0);
      expect(identities(result.stdout)).toEqual([third, first].map(identity));
    });
  });

  it("delete-absent-draft: deleting an absent draft fails, names it once, and leaves the one draft", async () => {
    await withChangeDraftEnv(async (env) => {
      await env.placeDraft(first.kind, first.draftId);
      const result = await env.runCli([name, operations.delete, kindOption, absent.kind, absent.draftId]);
      expect(result.status).not.toBe(0);
      expect(result.stderr.trim().split("\n")).toHaveLength(1);
      expect(result.stderr).toContain(identity(absent));
      const listed = await env.runCli([name, operations.list, allOption]);
      expect(identities(listed.stdout)).toEqual([identity(first)]);
    });
  });
});
