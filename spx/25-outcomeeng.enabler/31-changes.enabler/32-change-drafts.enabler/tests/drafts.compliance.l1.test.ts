import fc from "fast-check";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHANGE_DRAFT,
  CHANGE_DRAFT_ERROR,
  CHANGE_DRAFT_OPERATION,
  changeDraftDescriptorSchema,
} from "@/lib/change-drafts/contract";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  arbitraryDraftContent,
  arbitraryDraftId,
  arbitraryDraftKind,
  arbitraryInvalidDraftId,
  arbitraryKindBatch,
  arbitraryNonV7Uuid,
  arbitraryUnsafeDraftDirectory,
} from "@testing/generators/change-drafts";
import {
  collidingDraftDependencies,
  failingDraftCloseDependencies,
  withChangeDraftEnv,
} from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

function kindAndContent() {
  return fc.tuple(arbitraryDraftKind(), arbitraryDraftContent());
}

describe("draft storage safety", () => {
  it("owner-only-access: draft files and kind directories are owner-only, and Git-visible storage is refused", async () => {
    await assertProperty(arbitraryDraftKind(), async (kind) => {
      await withChangeDraftEnv(async (env) => {
        const draft = await env.store.create(kind);
        const fileMode = (await env.inspect(draft.path)).mode;
        const directoryMode = (await env.inspect(env.kindDir(kind))).mode;
        expect(fileMode & (fsConstants.S_IRWXG | fsConstants.S_IRWXO)).toBe(0);
        expect(directoryMode & (fsConstants.S_IRWXG | fsConstants.S_IRWXO)).toBe(0);
        expect(fileMode & (fsConstants.S_IRUSR | fsConstants.S_IWUSR)).toBe(fsConstants.S_IRUSR | fsConstants.S_IWUSR);
        expect(directoryMode & fsConstants.S_IRWXU).toBe(fsConstants.S_IRWXU);
      });
      await withChangeDraftEnv(async (env) => {
        await env.makeVisibleToGit();
        await expect(env.store.create(kind)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.visibleToGit });
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("no-overwrite-no-escape: creation never overwrites, and deletion accepts no path, other kind, or symlink", async () => {
    await assertProperty(fc.tuple(kindAndContent(), arbitraryDraftKind(), arbitraryInvalidDraftId()), async (
      [[kind, content], otherKind, invalidId],
    ) => {
      fc.pre(otherKind !== kind);
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(kind);
        await env.write(retained, content);
        const colliding = await env.storeWith(collidingDraftDependencies(env, retained.draftId));
        await expect(colliding.create(kind)).rejects.toThrow();
        expect((await env.store.delete(otherKind, retained.draftId)).removed).toBe(false);
        await expect(env.store.delete(kind, invalidId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.invalidId });
        expect(await env.read(retained)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("exclusive-create: a failed creation removes only the file it created", async () => {
    await assertProperty(kindAndContent(), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(kind);
        await env.write(retained, content);
        const failing = await env.storeWith(failingDraftCloseDependencies(env));
        await expect(failing.create(kind)).rejects.toThrow();
        expect(await env.listPath(env.kindDir(kind))).toEqual([`${retained.draftId}${CHANGE_DRAFT.extension}`]);
        expect(await env.read(retained)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("storage-checked-before-create: unsafe or Git-visible storage is refused before any draft file exists", async () => {
    await assertProperty(fc.tuple(arbitraryUnsafeDraftDirectory(), arbitraryDraftId()), async (
      [{ kind, mode }, draftId],
    ) => {
      await withChangeDraftEnv(async (env) => {
        await env.setKindDirectoryMode(kind, mode);
        await expect(env.store.create(kind)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        expect(await env.listPath(env.kindDir(kind))).toEqual([]);
      });
      await withChangeDraftEnv(async (env) => {
        await env.makeVisibleToGit();
        await expect(env.store.create(kind)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.visibleToGit });
        await expect(env.inspect(env.draftsDir)).rejects.toThrow();
      });
      await withChangeDraftEnv(async (env) => {
        const target = await env.symlinkStorage();
        await expect(env.store.create(kind)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.list()).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.delete(kind, draftId)).rejects.toMatchObject({
          code: CHANGE_DRAFT_ERROR.unsafeStorage,
        });
        expect(await env.listPath(target)).toEqual([]);
      });
      await withChangeDraftEnv(async (env) => {
        const linked = await env.symlinkDraft(kind, draftId, kind);
        await expect(env.store.list(kind)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.unsafeStorage });
        await expect(env.store.delete(kind, draftId)).rejects.toMatchObject({
          code: CHANGE_DRAFT_ERROR.unsafeStorage,
        });
        expect(await env.readPath(linked.target)).toBe(kind);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("malformed-identifier-rejected: deletion rejects malformed identifiers and UUIDs of other versions", async () => {
    await assertProperty(
      fc.tuple(arbitraryDraftKind(), fc.oneof(arbitraryInvalidDraftId(), arbitraryNonV7Uuid())),
      async (
        [kind, invalidId],
      ) => {
        await withChangeDraftEnv(async (env) => {
          const retained = await env.store.create(kind);
          await expect(env.store.delete(kind, invalidId)).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.invalidId });
          expect(await env.store.list()).toEqual([retained]);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("draft results", () => {
  it("descriptor-fields: every descriptor carries kind, draftId, and a path inside its own kind directory", async () => {
    await assertProperty(arbitraryKindBatch(), async (kinds) => {
      await withChangeDraftEnv(async (env) => {
        const created = [];
        for (const kind of kinds) created.push(await env.store.create(kind));
        for (const draft of [...created, ...await env.store.list()]) {
          expect(Object.keys(draft).sort(compareAsciiStrings)).toEqual(
            Object.keys(changeDraftDescriptorSchema.shape).sort(compareAsciiStrings),
          );
          expect(changeDraftDescriptorSchema.safeParse(draft).success).toBe(true);
          expect(isAbsolute(draft.path)).toBe(true);
          expect(dirname(draft.path)).toBe(env.kindDir(draft.kind));
          expect(relative(env.kindDir(draft.kind), draft.path).startsWith("..")).toBe(false);
        }
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("list-order: listing reads no draft, orders newest first, and yields nothing for absent storage", async () => {
    await assertProperty(fc.tuple(arbitraryKindBatch(), arbitraryDraftContent()), async ([kinds, content]) => {
      await withChangeDraftEnv(async (env) => {
        expect(await env.store.list()).toEqual([]);
        expect(await env.store.list(kinds[0])).toEqual([]);
        await expect(env.inspect(env.draftsDir)).rejects.toThrow();
        for (const kind of kinds) await env.write(await env.store.create(kind), content);
        const ids = (await env.store.list()).map((draft) => draft.draftId);
        expect(ids).toEqual([...ids].sort(compareAsciiStrings).reverse());
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("delete-one-file: deletion removes exactly one regular file and reports removed or absent", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftId()), async ([kind, absentId]) => {
      await withChangeDraftEnv(async (env) => {
        const first = await env.store.create(kind);
        const second = await env.store.create(kind);
        expect(await env.store.delete(kind, first.draftId)).toEqual({ kind, draftId: first.draftId, removed: true });
        expect(await env.listPath(env.kindDir(kind))).toEqual([`${second.draftId}${CHANGE_DRAFT.extension}`]);
        expect(await env.store.delete(kind, first.draftId)).toEqual({ kind, draftId: first.draftId, removed: false });
        fc.pre(absentId !== second.draftId);
        expect((await env.store.delete(kind, absentId)).removed).toBe(false);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("error-context: a failed file operation names the operation and the path", async () => {
    await assertProperty(arbitraryDraftKind(), async (kind) => {
      await withChangeDraftEnv(async (env) => {
        const obstruction = await env.obstructStorage(kind);
        const error = await env.store.create(kind).catch((caught: unknown) => caught);
        expect(error).toMatchObject({ operation: CHANGE_DRAFT_OPERATION.create });
        expect(String((error as { path: string }).path).startsWith(obstruction)).toBe(true);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});

describe("draft isolation", () => {
  it("content-untouched: no operation reads or changes what a caller wrote", async () => {
    await assertProperty(kindAndContent(), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const draft = await env.store.create(kind);
        await env.write(draft, content);
        await env.store.list();
        await env.store.list(kind);
        await env.store.create(kind);
        expect(await env.read(draft)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("no-migration: no operation reads, moves, or deletes a retired per-worktree draft", async () => {
    await assertProperty(kindAndContent(), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const retired = await env.addRetiredDraft(content);
        const draft = await env.store.create(kind);
        await env.store.list();
        await env.store.delete(kind, draft.draftId);
        expect(await env.readPath(retired)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("exact-delete: deletion removes only the identified draft, whichever worktree created the others", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftKind()), async ([kind, otherKind]) => {
      await withChangeDraftEnv(async (env) => {
        const linked = await env.linkedWorktree();
        const target = await env.store.create(kind);
        const sameKind = await linked.store.create(kind);
        const other = await linked.store.create(otherKind);
        expect((await env.store.delete(kind, target.draftId)).removed).toBe(true);
        const remaining = await env.store.list();
        expect(remaining).toContainEqual(sameKind);
        expect(remaining).toContainEqual(other);
        expect(remaining).not.toContainEqual(target);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("delete-absent-fails: deleting a UUIDv7 that names no draft changes nothing and reports the absence", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftId()), async ([kind, absentId]) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(kind);
        fc.pre(absentId !== retained.draftId);
        expect(await env.store.delete(kind, absentId)).toEqual({ kind, draftId: absentId, removed: false });
        expect(await env.store.list()).toEqual([retained]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("no-foreign-state: no operation changes shared Change or verification records or the working directory", async () => {
    await assertProperty(kindAndContent(), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const records = await env.addSharedRecords(content);
        const cwd = process.cwd();
        const draft = await env.store.create(kind);
        await env.store.list();
        await env.store.delete(kind, draft.draftId);
        expect(process.cwd()).toBe(cwd);
        for (const record of records) expect(await env.readPath(record)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
