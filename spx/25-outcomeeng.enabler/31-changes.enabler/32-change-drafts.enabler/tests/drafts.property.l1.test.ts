import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHANGE_DRAFT } from "@/lib/change-drafts/contract";
import { arbitraryDraftBatch, arbitraryDraftId, arbitraryDraftPair } from "@testing/generators/change-drafts";
import { draftParentDirectory, withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("local draft lifecycle", () => {
  it("preserves opaque text and returns distinct, worktree-relative coordinates", async () => {
    await assertProperty(arbitraryDraftPair(), async (texts) => {
      await withChangeDraftEnv(async (env) => {
        const first = await env.store.create(texts.first);
        const second = await env.store.create(texts.second);
        expect(await env.read(first)).toBe(texts.first);
        expect(await env.read(second)).toBe(texts.second);
        expect(first.draftId).not.toBe(second.draftId);
        expect(first.path).not.toBe(second.path);
        expect(first.draftId).toMatch(CHANGE_DRAFT.idPattern);
        expect(isAbsolute(first.path)).toBe(true);
        expect(isAbsolute(first.relativePath)).toBe(false);
        expect(resolve(env.productDir, first.relativePath)).toBe(first.path);
        expect(draftParentDirectory(first)).toBe(env.draftDir);
        expect((await env.inspect(first.path)).mode & CHANGE_DRAFT.permissionMask).toBe(CHANGE_DRAFT.fileMode);
        expect((await env.inspect(env.draftDir)).mode & CHANGE_DRAFT.permissionMask).toBe(CHANGE_DRAFT.directoryMode);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("lists every retained draft ordinally without changing contents", async () => {
    await assertProperty(arbitraryDraftBatch(), async (texts) => {
      await withChangeDraftEnv(async (env) => {
        const created = [];
        for (const text of texts) created.push(await env.store.create(text));
        const unmanaged = await env.addUnmanagedFile(created[0].draftId, texts[0]);
        const listed = await env.store.list();
        expect(new Set(listed.map((draft) => draft.draftId))).toEqual(new Set(created.map((draft) => draft.draftId)));
        expect(listed.map((draft) => draft.draftId)).toEqual(created.map((draft) => draft.draftId).sort());
        expect(await Promise.all(created.map((draft) => env.read(draft)))).toEqual(texts);
        expect(await env.store.list()).toEqual(listed);
        expect(await env.readPath(unmanaged)).toBe(texts[0]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("reports an absent store and missing valid ID without creating storage", async () => {
    await assertProperty(arbitraryDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        expect(await env.store.list()).toHaveLength(0);
        expect((await env.store.delete(draftId)).removed).toBe(false);
        await expect(env.inspect(env.draftDir)).rejects.toThrow();
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("deletes exactly one file and leaves sibling-worktree drafts unchanged", async () => {
    await assertProperty(arbitraryDraftPair(), async (texts) => {
      await withChangeDraftEnv(async (env) => {
        const sibling = await env.sibling();
        const first = await env.store.create(texts.first);
        const retained = await env.store.create(texts.second);
        const siblingDraft = await sibling.store.create(texts.first);
        expect(await env.store.list()).not.toContainEqual(siblingDraft);
        expect(await sibling.store.list()).toEqual([siblingDraft]);
        expect((await env.store.delete(first.draftId)).removed).toBe(true);
        await expect(env.inspect(first.path)).rejects.toThrow();
        expect(await env.read(retained)).toBe(texts.second);
        expect(await env.read(siblingDraft)).toBe(texts.first);
        expect(await env.store.list()).toEqual([retained]);
        expect((await env.store.delete(first.draftId)).removed).toBe(false);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
