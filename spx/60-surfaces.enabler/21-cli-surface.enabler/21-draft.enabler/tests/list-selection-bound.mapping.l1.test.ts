import { describe, expect, it } from "vitest";

import { DRAFT_COMMAND } from "@/commands/draft/contract";
import { generateUuidV7 } from "@/lib/change-drafts/contract";
import { arbitraryListSelectionStore } from "@testing/generators/change-drafts";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withChangeDraftEnv } from "@testing/harnesses/change-drafts";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

interface Placed {
  readonly kind: string;
  readonly draftId: string;
}

describe("list-selection-bound: spx draft list maps its selection options to the descriptors it emits", () => {
  const { name, operations, kindOption, limitOption, allOption, defaultListLimit } = DRAFT_COMMAND;
  const store = sampleGeneratedValue(arbitraryListSelectionStore(defaultListLimit));
  const [kind] = store.kinds;
  const ofKind = (drafts: Placed[]) => drafts.filter((draft) => draft.kind === kind);
  const rows: { case: string; options: string[]; emitted: (newestFirst: Placed[]) => Placed[] }[] = [
    { case: "default bound", options: [], emitted: (all) => all.slice(0, defaultListLimit) },
    { case: "one kind", options: [kindOption, kind], emitted: ofKind },
    {
      case: "limit across kinds",
      options: [limitOption, String(store.limit)],
      emitted: (all) => all.slice(0, store.limit),
    },
    {
      case: "limit of one kind",
      options: [kindOption, kind, limitOption, String(store.limit)],
      emitted: (all) => ofKind(all).slice(0, store.limit),
    },
    { case: "every kind", options: [allOption], emitted: (all) => all },
    { case: "every draft of one kind", options: [kindOption, kind, allOption], emitted: ofKind },
  ];

  it.each(rows)("$case", async (row) => {
    await withChangeDraftEnv(async (env) => {
      const placed: Placed[] = [];
      let millisecond = store.firstMillisecond;
      for (let index = 0; index < store.perKind; index += 1) {
        for (const draftKind of store.kinds) {
          const draftId = generateUuidV7(() => millisecond);
          millisecond += 1;
          await env.placeDraft(draftKind, draftId);
          placed.push({ kind: draftKind, draftId });
        }
      }
      const result = await env.runCli([name, operations.list, ...row.options]);
      expect(result.status, result.stderr).toBe(0);
      const emitted = (JSON.parse(result.stdout) as Placed[]).map((draft) => ({
        kind: draft.kind,
        draftId: draft.draftId,
      }));
      expect(emitted).toEqual(row.emitted([...placed].reverse()));
    });
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);
});
