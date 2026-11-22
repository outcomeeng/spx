import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { changeDraftDescriptorSchema } from "@/lib/change-drafts/contract";
import {
  arbitraryDraftContent,
  arbitraryDraftId,
  arbitraryDraftKind,
  arbitraryInvalidDraftKind,
  arbitraryKindBatch,
} from "@testing/generators/change-drafts";
import { printableCharacters, uuidFacts, withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

const { name, operations, kindOption, allOption } = DRAFT_COMMAND;

function newestFirst<T extends { draftId: string }>(drafts: readonly T[]): T[] {
  return [...drafts].sort((left, right) => (left.draftId < right.draftId ? 1 : -1));
}

describe("draft command results", () => {
  it("draft-create-result: create takes no text or input option, creates one empty file, and emits its descriptor", async () => {
    await assertProperty(arbitraryDraftKind(), async (kind) => {
      await withChangeDraftEnv(async (env) => {
        const result = await env.runCli([name, operations.create, kindOption, kind]);
        expect(result.status, result.stderr).toBe(0);
        const draft = changeDraftDescriptorSchema.parse(JSON.parse(result.stdout));
        expect(draft.kind).toBe(kind);
        expect(uuidFacts(draft.draftId).lowercase).toBe(true);
        expect(uuidFacts(draft.draftId).version).toBe(7);
        expect(await env.read(draft)).toHaveLength(0);
        expect(await env.store.list()).toEqual([draft]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("draft-list-result: list --all and list --kind emit every matching descriptor newest first and change nothing", async () => {
    await assertProperty(fc.tuple(arbitraryKindBatch(), arbitraryDraftContent()), async ([kinds, content]) => {
      await withChangeDraftEnv(async (env) => {
        const created = [];
        for (const kind of kinds) {
          const draft = await env.store.create(kind);
          await env.write(draft, content);
          created.push(draft);
        }
        const all = await env.runCli([name, operations.list, allOption]);
        expect(all.status, all.stderr).toBe(0);
        expect(changeDraftDescriptorSchema.array().parse(JSON.parse(all.stdout))).toEqual(newestFirst(created));
        for (const kind of new Set(kinds)) {
          const one = await env.runCli([name, operations.list, kindOption, kind]);
          expect(one.status, one.stderr).toBe(0);
          expect(JSON.parse(one.stdout)).toEqual(newestFirst(created.filter((draft) => draft.kind === kind)));
        }
        expect(await Promise.all(created.map((draft) => env.read(draft)))).toEqual(created.map(() => content));
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("directory-context: -C resolves every draft operation against that repository from any ambient directory", async () => {
    await assertProperty(arbitraryDraftKind(), async (kind) => {
      await withChangeDraftEnv(async (env) => {
        const linked = await env.linkedWorktree();
        await withChangeDraftEnv(async (ambient) => {
          const directory = [SPX_GLOBAL_OPTIONS.directory.short, linked.productDir];
          const created = await ambient.runCli([...directory, name, operations.create, kindOption, kind]);
          expect(created.status, created.stderr).toBe(0);
          const draft = changeDraftDescriptorSchema.parse(JSON.parse(created.stdout));
          expect(await env.store.list()).toEqual([draft]);
          expect(await ambient.store.list()).toEqual([]);
          const listed = await ambient.runCli([
            SPX_GLOBAL_OPTIONS.directory.short,
            env.productDir,
            name,
            operations.list,
          ]);
          expect(JSON.parse(listed.stdout)).toEqual([draft]);
          const deleted = await ambient.runCli([
            ...directory,
            name,
            operations.delete,
            kindOption,
            kind,
            draft.draftId,
          ]);
          expect(deleted.status, deleted.stderr).toBe(0);
          expect(await env.store.list()).toEqual([]);
        });
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("kind-rejections: create, list, and delete reject a value outside the kind grammar and alter no draft", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryInvalidDraftKind(), arbitraryDraftId()), async (
      [kind, invalid, draftId],
    ) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(kind);
        for (
          const args of [
            [name, operations.create, kindOption, invalid],
            [name, operations.list, kindOption, invalid],
            [name, operations.delete, kindOption, invalid, draftId],
          ]
        ) {
          const result = await env.runCli(args);
          expect(result.status).not.toBe(0);
          expect(result.stderr.length).toBeGreaterThan(0);
          expect(result.stdout).toHaveLength(0);
        }
        expect(await env.store.list()).toEqual([retained]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("external-values-escaped: JSON keeps values as data and diagnostics escape external segments", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryInvalidDraftKind()), async ([kind, invalid]) => {
      await withChangeDraftEnv(async (env) => {
        const created = await env.runCli([name, operations.create, kindOption, kind]);
        expect(JSON.parse(created.stdout).kind).toBe(kind);
        const rejected = await env.runCli([name, operations.create, kindOption, invalid]);
        expect(printableCharacters(rejected.stderr).every(Boolean)).toBe(true);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
