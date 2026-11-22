/** The drafts the listing and absent-deletion Scenarios of the draft command name, in creation order. */
export const DRAFT_LISTING_SCENARIO = {
  first: { kind: "change", draftId: "019a8b3c-4d5e-7f60-8a1b-2c3d4e5f6a7b" },
  second: { kind: "review", draftId: "019a8b3c-5e6f-7a01-9b2c-3d4e5f6a7b8c" },
  third: { kind: "change", draftId: "019a8b3c-6f70-7b12-ac3d-4e5f6a7b8c9d" },
  absent: { kind: "change", draftId: "019a8b3c-7081-7c23-bd4e-5f6a7b8c9dae" },
} as const;
