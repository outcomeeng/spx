import { createChangeDraftStore } from "@/lib/change-drafts";
import type { ChangeDraftDeletion, ChangeDraftDescriptor, ChangeDraftStoreOptions } from "@/lib/change-drafts/contract";

export async function createDraftCommand(
  options: ChangeDraftStoreOptions,
  text: string,
): Promise<ChangeDraftDescriptor> {
  return (await createChangeDraftStore(options)).create(text);
}

export async function listDraftsCommand(options: ChangeDraftStoreOptions): Promise<readonly ChangeDraftDescriptor[]> {
  return (await createChangeDraftStore(options)).list();
}

export async function deleteDraftCommand(
  options: ChangeDraftStoreOptions,
  draftId: string,
): Promise<ChangeDraftDeletion> {
  return (await createChangeDraftStore(options)).delete(draftId);
}
