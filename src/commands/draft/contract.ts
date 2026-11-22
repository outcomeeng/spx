import { CHANGE_DRAFT_OPERATION } from "@/lib/change-drafts/contract";

export const DRAFT_COMMAND = {
  name: "draft",
  operations: CHANGE_DRAFT_OPERATION,
  kindOption: "--kind",
  kindValue: "<kind>",
  limitOption: "--limit",
  limitValue: "<count>",
  allOption: "--all",
  idOperand: "<draft-id>",
  identitySeparator: "/",
  defaultListLimit: 50,
} as const;

/** The selection bound `spx draft list` applies: every descriptor, or the newest `limit` of them. */
export type DraftListBound = { readonly all: true } | { readonly all: false; readonly limit: number };

export interface DraftListSelection {
  readonly kind?: string;
  readonly bound: DraftListBound;
}
