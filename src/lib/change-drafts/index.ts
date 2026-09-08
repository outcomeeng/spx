import type { ChangeDraftStore, ChangeDraftStoreOptions } from "./contract";

function missingDraftOperation(): Promise<never> {
  return Promise.reject(new Error("Local draft operations are not implemented"));
}

export function createChangeDraftStore(options: ChangeDraftStoreOptions): Promise<ChangeDraftStore> {
  void options;
  return Promise.resolve({
    create: missingDraftOperation,
    list: missingDraftOperation,
    delete: missingDraftOperation,
  });
}
