import fc from "fast-check";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

import { CHANGE_DRAFT, CHANGE_DRAFT_ERROR, generateUuidV7 } from "@/lib/change-drafts/contract";
import {
  arbitraryDistinctMilliseconds,
  arbitraryDraftContent,
  arbitraryDraftId,
  arbitraryDraftKind,
  arbitraryInvalidDraftKind,
  arbitraryKindBatch,
} from "@testing/generators/change-drafts";
import { fixedIdDependencies, uuidFacts, withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("draft creation and listing", () => {
  it("create-names-empty-file: creates one empty file per creation and returns its kind, ID, and path", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftKind()), async ([firstKind, secondKind]) => {
      await withChangeDraftEnv(async (env) => {
        const first = await env.store.create(firstKind);
        const second = await env.store.create(secondKind);
        for (const [draft, kind] of [[first, firstKind], [second, secondKind]] as const) {
          expect(draft.kind).toBe(kind);
          expect(isAbsolute(draft.path)).toBe(true);
          expect(draft.path).toBe(join(env.kindDir(kind), `${draft.draftId}${CHANGE_DRAFT.extension}`));
          expect(await env.read(draft)).toHaveLength(0);
        }
        expect(first.draftId).not.toBe(second.draftId);
        expect(first.path).not.toBe(second.path);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("shared-storage: every worktree creates, lists, and deletes the same drafts under .spx/drafts/<kind>/", async () => {
    await assertProperty(arbitraryDraftKind(), async (kind) => {
      await withChangeDraftEnv(async (env) => {
        const linked = await env.linkedWorktree();
        const fromMain = await env.store.create(kind);
        const fromLinked = await linked.store.create(kind);
        expect(fromLinked.path).toBe(join(env.kindDir(kind), `${fromLinked.draftId}${CHANGE_DRAFT.extension}`));
        expect(await linked.store.list(kind)).toEqual(await env.store.list(kind));
        expect((await linked.store.delete(kind, fromMain.draftId)).removed).toBe(true);
        expect(await env.store.list(kind)).toEqual([fromLinked]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("kind-grammar: accepts every kind in the grammar and rejects every other value before writing", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryInvalidDraftKind(), arbitraryDraftId()), async (
      [kind, invalid, draftId],
    ) => {
      await withChangeDraftEnv(async (env) => {
        expect((await env.store.create(kind)).kind).toBe(kind);
        for (
          const operation of [
            () => env.store.create(invalid),
            () => env.store.list(invalid),
            () => env.store.delete(invalid, draftId),
          ]
        ) {
          await expect(operation()).rejects.toMatchObject({ code: CHANGE_DRAFT_ERROR.invalidKind, path: invalid });
        }
        expect(await env.listPath(env.draftsDir)).toEqual([kind]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("list-by-kind: lists one kind or every kind newest first without changing a draft", async () => {
    await assertProperty(fc.tuple(arbitraryKindBatch(), arbitraryDraftContent()), async ([kinds, content]) => {
      await withChangeDraftEnv(async (env) => {
        const created = [];
        for (const kind of kinds) created.push(await env.store.create(kind));
        for (const draft of created) await env.write(draft, content);
        const unmanaged = await env.addUnmanagedFile(kinds[0], created[0].draftId, content);
        const everyKind = await env.store.list();
        const newestFirst = [...created].sort((left, right) => (left.draftId < right.draftId ? 1 : -1));
        expect(everyKind).toEqual(newestFirst);
        for (const kind of new Set(kinds)) {
          expect(await env.store.list(kind)).toEqual(newestFirst.filter((draft) => draft.kind === kind));
        }
        expect(await Promise.all(created.map((draft) => env.read(draft)))).toEqual(created.map(() => content));
        expect(await env.readPath(unmanaged)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("draft-identifiers: returns the injected generator's identifier unchanged", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftId()), async ([kind, draftId]) => {
      await withChangeDraftEnv(async (env) => {
        const store = await env.storeWith(fixedIdDependencies(env, [draftId]));
        expect((await store.create(kind)).draftId).toBe(draftId);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("draft-identifier-order: an earlier millisecond yields a lowercase UUIDv7 that precedes a later one", async () => {
    await assertProperty(arbitraryDistinctMilliseconds(), async (milliseconds) => {
      const ids = milliseconds.map((millisecond) => generateUuidV7(() => millisecond));
      ids.forEach((id, index) => {
        const facts = uuidFacts(id);
        expect(facts.lowercase).toBe(true);
        expect(facts.hexDigits).toBe(32);
        expect(facts.version).toBe(7);
        expect(facts.variantBits).toBe(2);
        expect(facts.timestampMs).toBe(milliseconds[index]);
        if (index > 0) expect(ids[index - 1] < id).toBe(true);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});

describe("draft deletion", () => {
  it("delete-isolated: deleting a draft leaves published Changes and verification records unchanged", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftContent()), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const records = await env.addSharedRecords(content);
        const draft = await env.store.create(kind);
        expect((await env.store.delete(kind, draft.draftId)).removed).toBe(true);
        for (const record of records) expect(await env.readPath(record)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
