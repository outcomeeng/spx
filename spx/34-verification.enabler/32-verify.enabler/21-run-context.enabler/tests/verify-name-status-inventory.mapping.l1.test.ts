import { describe, expect, it } from "vitest";

import {
  changeInventoryOfNameStatus,
  VERIFY_CHANGE_KIND,
  type VerifyChangeInventoryEntry,
} from "@/domains/verify/verify";
import { GIT_COPY_STATUS_EXAMPLE, GIT_RENAME_STATUS_EXAMPLE } from "@/lib/git/name-status";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  formatTwoPathNameStatusZ,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
  type VerifyNameStatusPaths,
  type VerifyNameStatusTwoPathRecord,
} from "@testing/generators/verify/verify";

interface NameStatusInventoryCase {
  readonly name: string;
  readonly records: (paths: VerifyNameStatusPaths) => readonly VerifyNameStatusTwoPathRecord[];
  readonly entries: (paths: VerifyNameStatusPaths) => readonly VerifyChangeInventoryEntry[];
}

// The cases of the `name-status-inventory` mapping: each set of name-status records maps to the
// inventory entries it contributes, and a base-side path held as `deleted` carries no `copy-source`.
const nameStatusInventoryCases: readonly NameStatusInventoryCase[] = [
  {
    name: "copied",
    records: ({ sourcePath, copiedPath }) => [
      { status: GIT_COPY_STATUS_EXAMPLE, sourcePath, targetPath: copiedPath },
    ],
    entries: ({ sourcePath, copiedPath }) => [
      { path: copiedPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
      { path: sourcePath, changeKind: VERIFY_CHANGE_KIND.COPY_SOURCE },
    ],
  },
  {
    name: "renamed",
    records: ({ sourcePath, renamedPath }) => [
      { status: GIT_RENAME_STATUS_EXAMPLE, sourcePath, targetPath: renamedPath },
    ],
    entries: ({ sourcePath, renamedPath }) => [
      { path: sourcePath, changeKind: VERIFY_CHANGE_KIND.DELETED },
      { path: renamedPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
    ],
  },
  {
    name: "renamed-and-copied",
    records: ({ sourcePath, renamedPath, copiedPath }) => [
      { status: GIT_COPY_STATUS_EXAMPLE, sourcePath, targetPath: copiedPath },
      { status: GIT_RENAME_STATUS_EXAMPLE, sourcePath, targetPath: renamedPath },
    ],
    entries: ({ sourcePath, renamedPath, copiedPath }) => [
      { path: copiedPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
      { path: renamedPath, changeKind: VERIFY_CHANGE_KIND.ADDED },
      { path: sourcePath, changeKind: VERIFY_CHANGE_KIND.DELETED },
    ],
  },
];

function byPathThenKind(left: VerifyChangeInventoryEntry, right: VerifyChangeInventoryEntry): number {
  return compareAsciiStrings(left.path, right.path) || compareAsciiStrings(left.changeKind, right.changeKind);
}

describe("name-status inventory mapping", () => {
  it.each(nameStatusInventoryCases.map((testCase) => [testCase.name, testCase] as const))(
    "maps the %s records to the inventory entries they contribute",
    (_name, testCase) => {
      const paths = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.nameStatusPaths());

      const inventory = changeInventoryOfNameStatus(formatTwoPathNameStatusZ(testCase.records(paths)));

      expect(inventory).toEqual([...testCase.entries(paths)].sort(byPathThenKind));
    },
  );
});
