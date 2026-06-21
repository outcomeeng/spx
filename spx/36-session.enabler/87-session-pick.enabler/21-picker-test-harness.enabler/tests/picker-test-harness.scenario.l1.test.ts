import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbitrarySessionId, claimableSession } from "@testing/generators/session/session";
import { renderPickerView } from "@testing/harnesses/session/picker";

describe("picker test harness — scenarios", () => {
  it("renderPickerView surfaces each session's row and moves the selection on arrow drivers", async () => {
    const [firstId, secondId] = fc.sample(fc.uniqueArray(arbitrarySessionId(), { minLength: 2, maxLength: 2 }), 1)[0];
    const sessions = [claimableSession({ id: firstId }), claimableSession({ id: secondId })];
    const view = renderPickerView({ sessions });

    expect(view.rowLinesFor(firstId).length).toBeGreaterThan(0);
    expect(view.rowLinesFor(secondId).length).toBeGreaterThan(0);
    expect(view.preview()).not.toBeNull();

    const initialSelection = view.selectedRow();
    expect(initialSelection).toBeDefined();

    await view.arrowDown();
    const movedSelection = view.selectedRow();
    expect(movedSelection).toBeDefined();
    expect(movedSelection).not.toEqual(initialSelection);

    await view.arrowUp();
    expect(view.selectedRow()).toEqual(initialSelection);

    view.unmount();
  });
});
