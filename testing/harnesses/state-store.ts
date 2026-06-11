const RUN_FILE_PREFIX = "run-";
const JSONL_EXTENSION = ".jsonl";

export function expectedStateStoreRunFileName(runToken: string): string {
  return `${RUN_FILE_PREFIX}${runToken}${JSONL_EXTENSION}`;
}
