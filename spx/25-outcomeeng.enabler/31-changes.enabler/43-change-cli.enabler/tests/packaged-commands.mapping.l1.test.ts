import { describe, expect, it } from "vitest";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { changeDraftDeletionSchema, changeDraftDescriptorSchema } from "@/lib/change-drafts/contract";
import { arbitraryNonemptyDraftText } from "@testing/generators/change-drafts";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";

describe("packaged draft commands", () => {
  it.each(Object.values(CHANGE_COMMAND.operations))("executes %s through the registered CLI", async (operation) => {
    await withChangeDraftEnv(async (env) => {
      const text = sampleGeneratedValue(arbitraryNonemptyDraftText());
      switch (operation) {
        case CHANGE_COMMAND.operations.create: {
          const result = env.runPackagedCli([
            CHANGE_COMMAND.name,
            CHANGE_COMMAND.draft,
            operation,
            CHANGE_COMMAND.inputOption,
            CHANGE_COMMAND.stdin,
          ], text);
          expect(result.status, result.stderr).toBe(0);
          expect(await env.read(changeDraftDescriptorSchema.parse(JSON.parse(result.stdout)))).toBe(text);
          break;
        }
        case CHANGE_COMMAND.operations.list: {
          const draft = await env.store.create(text);
          const result = env.runPackagedCli([CHANGE_COMMAND.name, CHANGE_COMMAND.draft, operation]);
          expect(result.status, result.stderr).toBe(0);
          expect(changeDraftDescriptorSchema.array().parse(JSON.parse(result.stdout))).toEqual([draft]);
          expect(await env.read(draft)).toBe(text);
          break;
        }
        case CHANGE_COMMAND.operations.delete: {
          const draft = await env.store.create(text);
          const result = env.runPackagedCli([CHANGE_COMMAND.name, CHANGE_COMMAND.draft, operation, draft.draftId]);
          expect(result.status, result.stderr).toBe(0);
          expect(changeDraftDeletionSchema.parse(JSON.parse(result.stdout))).toEqual({
            draftId: draft.draftId,
            removed: true,
          });
          await expect(env.inspect(draft.path)).rejects.toThrow();
          break;
        }
        default:
          expect.unreachable(operation);
      }
    });
  });
});
