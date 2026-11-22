import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { changeDraftDeletionSchema } from "@/lib/change-drafts/contract";
import {
  arbitraryCliInvalidDraftId,
  arbitraryDraftContent,
  arbitraryDraftId,
  arbitraryDraftKind,
  arbitraryInvalidDraftCommand,
} from "@testing/generators/change-drafts";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

const { name, operations, kindOption } = DRAFT_COMMAND;

describe("draft commands", () => {
  it("draft-delete-result: delete removes only the named kind's draft and emits one JSON deletion result", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftKind()), async ([kind, otherKind]) => {
      await withChangeDraftEnv(async (env) => {
        const target = await env.store.create(kind);
        const kept = await env.store.create(kind);
        const other = await env.store.create(otherKind);
        const result = await env.runCli([name, operations.delete, kindOption, kind, target.draftId]);
        expect(result.status, result.stderr).toBe(0);
        expect(changeDraftDeletionSchema.parse(JSON.parse(result.stdout))).toEqual({
          kind,
          draftId: target.draftId,
          removed: true,
        });
        const remaining = await env.store.list();
        expect(remaining).toContainEqual(kept);
        expect(remaining).toContainEqual(other);
        expect(remaining).not.toContainEqual(target);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("delete-absent: deleting a UUIDv7 that names no draft fails with a diagnostic and changes no draft", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftId()), async ([kind, absentId]) => {
      await withChangeDraftEnv(async (env) => {
        const retained = await env.store.create(kind);
        fc.pre(absentId !== retained.draftId);
        const result = await env.runCli([name, operations.delete, kindOption, kind, absentId]);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toHaveLength(0);
        const identity = [kind, absentId].join(DRAFT_COMMAND.identitySeparator);
        expect(result.stderr).toContain(identity);
        expect(await env.store.list()).toEqual([retained]);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });

  it("draft-command-rejections: invalid invocations and identifiers fail with stderr and alter no draft", async () => {
    await assertProperty(
      fc.tuple(arbitraryDraftKind(), arbitraryInvalidDraftCommand(), arbitraryCliInvalidDraftId()),
      async ([kind, command, invalidId]) => {
        await withChangeDraftEnv(async (env) => {
          const retained = await env.store.create(kind);
          for (const args of [command.args, [name, operations.delete, kindOption, kind, invalidId]]) {
            const result = await env.runCli(args);
            expect(result.status, args.join(" ")).not.toBe(0);
            expect(result.stderr.trim().length).toBeGreaterThan(0);
          }
          expect(await env.store.list()).toEqual([retained]);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("content-untouched: no draft command reads, parses, or changes what a caller wrote", async () => {
    await assertProperty(fc.tuple(arbitraryDraftKind(), arbitraryDraftContent()), async ([kind, content]) => {
      await withChangeDraftEnv(async (env) => {
        const draft = await env.store.create(kind);
        await env.write(draft, content);
        await env.runCli([name, operations.list]);
        await env.runCli([name, operations.list, kindOption, kind]);
        await env.runCli([name, operations.create, kindOption, kind]);
        expect(await env.read(draft)).toBe(content);
      });
    }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
  });
});
