/**
 * Picker-model mapping: each key resolves to its action.
 *
 * Parameterized over the source-owned key set, so a regression that drops or
 * remaps any key is caught.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { keyToAction, PICKER_ACTION, type PickerKey } from "@/domains/session/pick-model";

const NO_FLAGS: PickerKey = { input: "" };

/** A generated printable character, so the printable-key case carries no hand-picked literal. */
const PRINTABLE_CHAR = fc.sample(fc.string({ minLength: 1, maxLength: 1 }), 1)[0];

interface KeyCase {
  readonly label: string;
  readonly key: PickerKey;
  readonly expected: ReturnType<typeof keyToAction>;
}

const KEY_CASES: readonly KeyCase[] = [
  { label: "down arrow", key: { ...NO_FLAGS, downArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: 1 } },
  { label: "up arrow", key: { ...NO_FLAGS, upArrow: true }, expected: { type: PICKER_ACTION.MOVE, delta: -1 } },
  { label: "return", key: { ...NO_FLAGS, return: true }, expected: { type: PICKER_ACTION.CLAIM } },
  { label: "escape", key: { ...NO_FLAGS, escape: true }, expected: { type: PICKER_ACTION.CANCEL } },
  { label: "backspace", key: { ...NO_FLAGS, backspace: true }, expected: { type: PICKER_ACTION.FILTER_DELETE } },
  { label: "delete", key: { ...NO_FLAGS, delete: true }, expected: { type: PICKER_ACTION.FILTER_DELETE } },
  {
    label: "printable",
    key: { input: PRINTABLE_CHAR },
    expected: { type: PICKER_ACTION.FILTER_APPEND, char: PRINTABLE_CHAR },
  },
];

describe("keyToAction", () => {
  it.each(KEY_CASES)("maps $label to its action", ({ key, expected }) => {
    expect(keyToAction(key)).toEqual(expected);
  });

  it("resolves a key with no input and no control flag to no action", () => {
    expect(keyToAction(NO_FLAGS)).toBeNull();
  });
});
