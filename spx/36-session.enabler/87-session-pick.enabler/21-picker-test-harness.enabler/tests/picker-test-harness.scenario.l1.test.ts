import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbitraryClaimableSession } from "@testing/generators/session/session";
import { renderPickerView } from "@testing/harnesses/session/picker";

describe("picker test harness — scenarios", () => {
  it("renderPickerView mounts the picker, surfaces the session's row and preview, and stays valid after arrows", async () => {
    const session = fc.sample(arbitraryClaimableSession(), 1)[0];
    const view = renderPickerView({ sessions: [session] });

    expect(view.rowLinesFor(session.id).length).toBeGreaterThan(0);
    expect(view.preview()).not.toBeNull();

    await view.arrowDown();
    await view.arrowUp();
    expect(view.selectedRow()).toBeDefined();

    view.unmount();
  });
});
