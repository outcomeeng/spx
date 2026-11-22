import { createChangeDraftStore } from "@/lib/change-drafts";
import type { ChangeDraftDeletion, ChangeDraftDescriptor, ChangeDraftStoreOptions } from "@/lib/change-drafts/contract";

import type { DraftListSelection } from "./contract";

export async function createDraftCommand(
  options: ChangeDraftStoreOptions,
  kind: string,
): Promise<ChangeDraftDescriptor> {
  return (await createChangeDraftStore(options)).create(kind);
}

/** Applies the selection bound to the complete newest-first listing the draft capability returns. */
export async function listDraftsCommand(
  options: ChangeDraftStoreOptions,
  selection: DraftListSelection,
): Promise<readonly ChangeDraftDescriptor[]> {
  const listing = await (await createChangeDraftStore(options)).list(selection.kind);
  return selection.bound.all ? listing : listing.slice(0, selection.bound.limit);
}

export async function deleteDraftCommand(
  options: ChangeDraftStoreOptions,
  kind: string,
  draftId: string,
): Promise<ChangeDraftDeletion> {
  return (await createChangeDraftStore(options)).delete(kind, draftId);
}
