import { describe, expect, it } from "vitest";

import { createChangeDraftStore } from "@/lib/change-drafts";
import { CHANGE_DRAFT_ERROR } from "@/lib/change-drafts/contract";
import {
  arbitraryDraftId,
  arbitraryDraftPair,
  arbitraryDraftText,
  arbitraryInvalidDraftId,
} from "@testing/generators/change-drafts";
import {
  collidingDraftDependencies,
  failingDraftWriteDependencies,
  withChangeDraftEnv,
} from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("draft storage safety", () => {
  it("rejects colliding IDs without replacing the retained candidate", async () => {
    await assertProperty(arbitraryDraftPair(), async (texts) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(texts.first);
        const colliding = await createChangeDraftStore({
          cwd: env.productDir,
          dependencies: collidingDraftDependencies(env, retained.draftId),
        });
        await expect(colliding.create(texts.second)).rejects.toThrow();
        expect(await env.read(retained)).toBe(texts.first);
        expect(await env.store.list()).toEqual([retained]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("removes only its own incomplete file when writing fails", async () => {
    await assertProperty(arbitraryDraftPair(), async (texts) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(texts.first);
        const failing = await createChangeDraftStore({
          cwd: env.productDir,
          dependencies: failingDraftWriteDependencies(env),
        });
        await expect(failing.create(texts.second)).rejects.toThrow();
        expect(await env.read(retained)).toBe(texts.first);
        expect(await env.store.list()).toEqual([retained]);
        expect(await env.retainedNames()).toHaveLength(1);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects Git-visible destinations before creating draft storage", async () => {
    await assertProperty(arbitraryDraftText(), async (text) => {
      await withChangeDraftEnv(async (env) => {
        await env.makeVisibleToGit();
        await expect(env.store.create(text)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.visibleToGit });
        await expect(env.inspect(env.draftDir)).rejects.toThrow();
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects malformed identifiers and paths while retaining valid drafts", async () => {
    await assertProperty(arbitraryInvalidDraftId(), async (invalidId) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(invalidId);
        await expect(env.store.delete(invalidId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.invalidId });
        expect(await env.store.list()).toEqual([retained]);
        expect(await env.read(retained)).toBe(invalidId);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects symlinked storage for create, list, and delete", async () => {
    await assertProperty(arbitraryDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        const target = await env.symlinkStorage();
        await expect(env.store.create(draftId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.list()).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.delete(draftId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        expect((await env.inspect(target)).isDirectory()).toBe(true);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects a regular file where a storage directory is required", async () => {
    await assertProperty(arbitraryDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        await env.obstructStorage(draftId);
        await expect(env.store.create(draftId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.list()).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.delete(draftId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("rejects symlinked candidates without reading or deleting their target", async () => {
    await assertProperty(arbitraryDraftId(), async (draftId) => {
      await withChangeDraftEnv(async (env) => {
        const linked = await env.symlinkDraft(draftId, draftId);
        await expect(env.store.list()).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.delete(draftId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        expect(await env.readPath(linked.target)).toBe(draftId);
        expect((await env.inspect(linked.path)).isSymbolicLink()).toBe(true);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
