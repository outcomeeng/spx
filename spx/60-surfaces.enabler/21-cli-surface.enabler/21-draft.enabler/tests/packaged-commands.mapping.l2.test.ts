import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { changeDraftDeletionSchema, changeDraftDescriptorSchema } from "@/lib/change-drafts/contract";
import { arbitraryDraftKind } from "@testing/generators/change-drafts";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import {
  PROPERTY_LEVEL,
  PROPERTY_TEST_ENVELOPE_MARGIN_MS,
  PROPERTY_TIMEOUTS_MS,
} from "@testing/harnesses/property/property";

const { name, operations, kindOption } = DRAFT_COMMAND;

describe("packaged-draft-commands: each draft operation is one spx draft command path", () => {
  it.each(Object.values(operations))("executes %s through the packaged CLI", async (operation) => {
    await withChangeDraftEnv(async (env) => {
      const kind = sampleGeneratedValue(arbitraryDraftKind());
      switch (operation) {
        case operations.create: {
          const result = env.runPackagedCli([name, operation, kindOption, kind]);
          expect(result.status, result.stderr).toBe(0);
          const draft = changeDraftDescriptorSchema.parse(JSON.parse(result.stdout));
          expect(draft.kind).toBe(kind);
          expect(await env.read(draft)).toHaveLength(0);
          break;
        }
        case operations.list: {
          const draft = await env.store.create(kind);
          const result = env.runPackagedCli([name, operation]);
          expect(result.status, result.stderr).toBe(0);
          expect(changeDraftDescriptorSchema.array().parse(JSON.parse(result.stdout))).toEqual([draft]);
          break;
        }
        case operations.delete: {
          const draft = await env.store.create(kind);
          const result = env.runPackagedCli([name, operation, kindOption, kind, draft.draftId]);
          expect(result.status, result.stderr).toBe(0);
          expect(changeDraftDeletionSchema.parse(JSON.parse(result.stdout))).toEqual({
            kind,
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
  }, PROPERTY_TIMEOUTS_MS[PROPERTY_LEVEL.L2] + PROPERTY_TEST_ENVELOPE_MARGIN_MS);
});
