/**
 * Picker-model mapping: each key resolves to its action, per mode.
 *
 * Browse mode and filter mode are enumerated separately over the source-owned
 * key set, so a regression that drops or remaps any key — or that lets a launch
 * key fire while a filter is open — is caught.
 */

import { describe, expect, it } from "vitest";

import { keyToAction, PICKER_ACTION, PICKER_MODE, PICKER_RUNTIME, type PickerKey } from "@/domains/session/pick-model";

const NO_FLAGS: PickerKey = { input: "" };

interface KeyCase {
  readonly label: string;
  readonly key: PickerKey;
  readonly expected: ReturnType<typeof keyToAction>;
}

const BROWSE_CASES: readonly KeyCase[] = [
  { label: "down arrow", key: { ...NO_FLAGS, downArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: 1 } },
  { label: "up arrow", key: { ...NO_FLAGS, upArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: -1 } },
  { label: "slash", key: { input: "/" }, expected: { type: PICKER_ACTION.ENTER_FILTER } },
  {
    label: "c",
    key: { input: "c" },
    expected: { type: PICKER_ACTION.LAUNCH, runtime: PICKER_RUNTIME.CLAUDE, autoContinue: false },
  },
  {
    label: "C",
    key: { input: "C" },
    expected: { type: PICKER_ACTION.LAUNCH, runtime: PICKER_RUNTIME.CLAUDE, autoContinue: true },
  },
  {
    label: "x",
    key: { input: "x" },
    expected: { type: PICKER_ACTION.LAUNCH, runtime: PICKER_RUNTIME.CODEX, autoContinue: false },
  },
  {
    label: "X",
    key: { input: "X" },
    expected: { type: PICKER_ACTION.LAUNCH, runtime: PICKER_RUNTIME.CODEX, autoContinue: true },
  },
  { label: "q", key: { input: "q" }, expected: { type: PICKER_ACTION.QUIT } },
  { label: "escape", key: { ...NO_FLAGS, escape: true }, expected: { type: PICKER_ACTION.QUIT } },
  { label: "return", key: { ...NO_FLAGS, return: true }, expected: null },
  { label: "unbound letter", key: { input: "z" }, expected: null },
];

const FILTER_CASES: readonly KeyCase[] = [
  { label: "down arrow", key: { ...NO_FLAGS, downArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: 1 } },
  { label: "up arrow", key: { ...NO_FLAGS, upArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: -1 } },
  { label: "return", key: { ...NO_FLAGS, return: true }, expected: { type: PICKER_ACTION.APPLY_FILTER } },
  { label: "escape", key: { ...NO_FLAGS, escape: true }, expected: { type: PICKER_ACTION.CLEAR_FILTER } },
  { label: "backspace", key: { ...NO_FLAGS, backspace: true }, expected: { type: PICKER_ACTION.FILTER_DELETE } },
  { label: "delete", key: { ...NO_FLAGS, delete: true }, expected: { type: PICKER_ACTION.FILTER_DELETE } },
  { label: "launch char c", key: { input: "c" }, expected: { type: PICKER_ACTION.FILTER_APPEND, char: "c" } },
  { label: "filter char /", key: { input: "/" }, expected: { type: PICKER_ACTION.FILTER_APPEND, char: "/" } },
  { label: "quit char q", key: { input: "q" }, expected: { type: PICKER_ACTION.FILTER_APPEND, char: "q" } },
];

describe("keyToAction", () => {
  it.each(BROWSE_CASES)("browse: maps $label to its action", ({ key, expected }) => {
    expect(keyToAction(key, PICKER_MODE.BROWSE)).toEqual(expected);
  });

  it.each(FILTER_CASES)("filter: maps $label to its action", ({ key, expected }) => {
    expect(keyToAction(key, PICKER_MODE.FILTER)).toEqual(expected);
  });
});
