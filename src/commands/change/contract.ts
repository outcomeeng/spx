import { CHANGE_DRAFT_OPERATION } from "@/lib/change-drafts/contract";

export const CHANGE_COMMAND = {
  name: "change",
  draft: "draft",
  operations: CHANGE_DRAFT_OPERATION,
  inputOption: "--input",
  stdin: "stdin",
} as const;
