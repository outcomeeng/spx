import { describe, expect, it } from "vitest";

import { CHANGE_COMMAND } from "@/commands/change/contract";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { changeDraftDeletionSchema, changeDraftDescriptorSchema } from "@/lib/change-drafts/contract";
import { escapeCliArgument } from "@/lib/sanitize-cli-argument";
import {
  arbitraryCliInvalidDraftId,
  arbitraryDraftText,
  arbitraryInvalidDraftCommands,
} from "@testing/generators/change-drafts";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("draft CLI", () => {
  it("preserves stdin text and reports created coordinates as JSON", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const created = env.runCli([
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
        const listed = env.runCli([CHANGE_COMMAND.name, CHANGE_COMMAND.draft, CHANGE_COMMAND.operations.list]);
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
        const deleted = env.runCli([
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

  it("creates in the selected worktree when invoked from a different worktree", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const sibling = await env.sibling();
        const created = env.runCli([
          SPX_GLOBAL_OPTIONS.directory.short,
          sibling.productDir,
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.create,
          CHANGE_COMMAND.inputOption,
          CHANGE_COMMAND.stdin,
        ], text);
        expect(created.status).toBe(0);
        const draft = changeDraftDescriptorSchema.parse(JSON.parse(created.stdout));
        expect(await sibling.store.list()).toEqual([draft]);
        expect(await env.store.list()).toHaveLength(0);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("lists the selected worktree when invoked from a different worktree", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const sibling = await env.sibling();
        const draft = await sibling.store.create(text);
        const listed = env.runCli([
          SPX_GLOBAL_OPTIONS.directory.short,
          sibling.productDir,
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.list,
        ]);
        expect(listed.status).toBe(0);
        expect(changeDraftDescriptorSchema.array().parse(JSON.parse(listed.stdout))).toEqual([draft]);
        expect(await env.store.list()).toHaveLength(0);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("deletes from the selected worktree when invoked from a different worktree", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        const sibling = await env.sibling();
        const draft = await sibling.store.create(text);
        const retained = await env.store.create(text);
        const deleted = env.runCli([
          SPX_GLOBAL_OPTIONS.directory.short,
          sibling.productDir,
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.delete,
          draft.draftId,
        ]);
        expect(deleted.status).toBe(0);
        expect(await sibling.store.list()).toHaveLength(0);
        expect(await env.read(retained)).toBe(text);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects arbitrary malformed delete IDs with an actionable diagnostic", async () => {
    await assertProperty(arbitraryCliInvalidDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        const result = env.runCli([
          CHANGE_COMMAND.name,
          CHANGE_COMMAND.draft,
          CHANGE_COMMAND.operations.delete,
          draftId,
        ]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(CHANGE_COMMAND.operations.delete);
        expect(result.stderr).toContain(escapeCliArgument(draftId));
        await expect(env.inspect(env.draftDir)).rejects.toThrow();
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects missing input, missing operands, unsupported input, and unknown commands without changing a draft", async () => {
    await assertProperty(arbitraryInvalidDraftCommands(), async (commands) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(JSON.stringify(commands));
        for (const command of commands) {
          const result = env.runCli(command);
          expect(result.status).not.toBe(0);
          expect(result.stderr.length).toBeGreaterThan(0);
        }
        expect(await env.read(retained)).toBe(JSON.stringify(commands));
        expect(await env.store.list()).toEqual([retained]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
