import * as fc from "fast-check";
import { describe, it } from "vitest";

import { visibleWidth } from "@/domains/session/display-width";
import { ELLIPSIS } from "@/domains/session/pick-model";
import { arbitraryGoalWiderThan, arbitrarySessionId, claimableSession } from "@testing/generators/session/session";
import { renderPickerView } from "@testing/harnesses/session/picker";

describe("SessionPicker rendering properties", () => {
  it("renders any over-width row on a single truncated line", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 160 }).chain((columns) =>
          fc.tuple(arbitraryGoalWiderThan(columns), arbitrarySessionId()).map(([goal, id]) => ({ columns, goal, id }))
        ),
        ({ columns, goal, id }) => {
          const view = renderPickerView({ sessions: [claimableSession({ id, goal })], columns });
          const rows = view.rowLinesFor(id);
          const ok = rows.length === 1 && visibleWidth(rows[0].trimEnd()) <= columns && rows[0].endsWith(ELLIPSIS);
          view.unmount();
          return ok;
        },
      ),
      { numRuns: 25 },
    );
  });
});
