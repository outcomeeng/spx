import { describe, expect, it } from "vitest";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { changeDraftDeletionSchema, changeDraftDescriptorSchema } from "@/lib/change-drafts/contract";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";
import {
  arbitraryCliInvalidDraftId,
  arbitraryDraftText,
  INVALID_DRAFT_COMMAND_GENERATORS,
} from "@testing/generators/change-drafts";
import { referenceDraftDiagnostic, withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("draft CLI", () => {
  it("preserves stdin text and reports created coordinates as JSON", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const created = await env.runCli([
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.create,
          CHANGE_COMMAND.inputOption,
          CHANGE_COMMAND.stdin,
        ], text);
        expect(created.status).toBe(0);
        const draft = changeDraftDescriptorSchema.parse(JSON.parse(created.stdout));
        expect(await env.read(draft)).toBe(text);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("reports retained drafts as a JSON array", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const draft = await env.store.create(text);
        const listed = await env.runCli([CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.list]);
        expect(listed.status).toBe(0);
        expect(changeDraftDescriptorSchema.array().parse(JSON.parse(listed.stdout))).toEqual([draft]);
        expect(await env.read(draft)).toBe(text);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("reports exact deletion as JSON", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const draft = await env.store.create(text);
        const deleted = await env.runCli([
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.delete,
          draft.draftId,
        ]);
        expect(deleted.status).toBe(0);
        expect(changeDraftDeletionSchema.parse(JSON.parse(deleted.stdout)).removed).toBe(true);
        await expect(env.inspect(draft.path)).rejects.toThrow();
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it.each(Object.values(CHANGE_COMMAND.operations))("resolves %s against the selected worktree", async (operation) => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const sibling = await env.sibling();
        const draft = await sibling.store.create(text);
        const retained = await env.store.create(text);
        const args: string[] = [
          SPX_GLOBAL_OPTIONS.directory.short,
          sibling.productDir,
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          operation,
        ];
        switch (operation) {
          case CHANGE_COMMAND.operations.create: {
            const result = await env.runCli([...args, CHANGE_COMMAND.inputOption, CHANGE_COMMAND.stdin], text);
            expect(result.status).toBe(0);
            const created = changeDraftDescriptorSchema.parse(JSON.parse(result.stdout));
            expect(await sibling.store.list()).toEqual(expect.arrayContaining([draft, created]));
            expect(await env.readPath(created.path)).toBe(text);
            break;
          }
          case CHANGE_COMMAND.operations.list: {
            const result = await env.runCli(args);
            expect(result.status).toBe(0);
            expect(changeDraftDescriptorSchema.array().parse(JSON.parse(result.stdout))).toEqual([draft]);
            expect(await env.readPath(draft.path)).toBe(text);
            break;
          }
          case CHANGE_COMMAND.operations.delete: {
            const result = await env.runCli([...args, draft.draftId]);
            expect(result.status).toBe(0);
            expect(changeDraftDeletionSchema.parse(JSON.parse(result.stdout))).toEqual({
              draftId: draft.draftId,
              removed: true,
            });
            expect(await sibling.store.list()).toHaveLength(0);
            break;
          }
          default:
            expect.unreachable(operation);
        }
        expect(await env.store.list()).toEqual([retained]);
        expect(await env.read(retained)).toBe(text);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects arbitrary malformed delete IDs with an actionable diagnostic", async () => {
    await assertProperty(arbitraryCliInvalidDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(draftId);
        const result = await env.runCli([
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.delete,
          draftId,
        ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(CHANGE_COMMAND.operations.delete);
        expect(result.stderr).toContain(escapeCliArgument(draftId));
        expect(await env.store.list()).toEqual([retained]);
        expect(await env.read(retained)).toBe(draftId);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it.each(Object.entries(INVALID_DRAFT_COMMAND_GENERATORS))(
    "rejects %s without changing a draft",
    async (_kind, commandArbitrary) => {
      await assertProperty(commandArbitrary(), async (command) => {
        await withChangeDraftEnv(async (env) => {
          const retained = await env.store.create(JSON.stringify(command));
          const result = await env.runCli(command.args);
          expect(result.status).not.toBe(0);
          const expectedDiagnostic = referenceDraftDiagnostic(command.args);
          expect(expectedDiagnostic.length).toBeGreaterThan(0);
          expect(result.stderr).toContain(expectedDiagnostic);
          expect(await env.read(retained)).toBe(JSON.stringify(command));
          expect(await env.store.list()).toEqual([retained]);
        });
      }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
    },
  );
});
