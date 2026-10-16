import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  VERIFY_CHANGE_INVENTORY_ENTRY_FIELD,
  VERIFY_CHANGE_KIND,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
} from "@/domains/verify/verify";
import { VERIFY_CHANGE_OPERATION, type VerifyChangeOperation } from "@testing/generators/verify/verify";
import { withVerifyChangeInventoryRepository } from "@testing/harnesses/verify/repository";

interface InventoryEntry {
  readonly path: string;
  readonly changeKind: string;
}

// The correspondence from a changeset's change operation to the inventory entries it contributes is
// the one the run-context assertion declares: an added path is `added`, a modified path and a type
// change are `modified`, a deleted path is `deleted`, a rename contributes its base-side path as
// `deleted` and its head-side path as `added`, and a copy contributes its head-side path as `added`
// and its base-side path, which the head still holds, as `copy-source`.
function declaredInventory(
  operation: VerifyChangeOperation,
  sourcePath: string,
  targetPath: string,
): readonly InventoryEntry[] {
  switch (operation) {
    case VERIFY_CHANGE_OPERATION.ADD:
      return [{ path: sourcePath, changeKind: VERIFY_CHANGE_KIND.ADDED }];
    case VERIFY_CHANGE_OPERATION.MODIFY:
    case VERIFY_CHANGE_OPERATION.TYPE_CHANGE:
      return [{ path: sourcePath, changeKind: VERIFY_CHANGE_KIND.MODIFIED }];
    case VERIFY_CHANGE_OPERATION.DELETE:
      return [{ path: sourcePath, changeKind: VERIFY_CHANGE_KIND.DELETED }];
    case VERIFY_CHANGE_OPERATION.RENAME:
      return [
        { path: sourcePath, changeKind: VERIFY_CHANGE_KIND.DELETED },
        { path: targetPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
      ];
    case VERIFY_CHANGE_OPERATION.COPY:
      return [
        { path: targetPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
        { path: sourcePath, changeKind: VERIFY_CHANGE_KIND.COPY_SOURCE },
      ];
  }
}

function byPath(left: InventoryEntry, right: InventoryEntry): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

describe("verify start change inventory", () => {
  it.each(Object.values(VERIFY_CHANGE_OPERATION))(
    "records on the run-context event the inventory entries a %s change contributes",
    async (operation) => {
      await withVerifyChangeInventoryRepository(operation, async (repository) => {
        await repository.startChangesetRun().then((run) => {
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          expect(run.runContextData).toHaveLength(1);
          const recorded =
            (run.runContextData[0]?.[VERIFY_RUN_CONTEXT_EVENT_FIELD.CHANGE_INVENTORY] ?? []) as readonly Record<
              string,
              string
            >[];
          expect(
            recorded
              .map((entry) => ({
                path: entry[VERIFY_CHANGE_INVENTORY_ENTRY_FIELD.PATH],
                changeKind: entry[VERIFY_CHANGE_INVENTORY_ENTRY_FIELD.CHANGE_KIND],
              }))
              .sort(byPath),
          ).toEqual([...declaredInventory(operation, repository.sourcePath, repository.targetPath)].sort(byPath));
        });
      });
    },
  );
});
