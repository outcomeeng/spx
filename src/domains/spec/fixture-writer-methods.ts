// Shared production metadata for spec-tree fixture writer methods.
// Literal validation imports this registry to classify test-authored setup data.
export const SPEC_TREE_ENV_FIXTURE_WRITER_METHOD = {
  DECISION: "writeDecision",
  NODE: "writeNode",
  RAW: "writeRaw",
} as const;

export type SpecTreeEnvFixtureWriterMethod =
  (typeof SPEC_TREE_ENV_FIXTURE_WRITER_METHOD)[keyof typeof SPEC_TREE_ENV_FIXTURE_WRITER_METHOD];

export const SPEC_TREE_ENV_FIXTURE_WRITER_METHODS = [
  SPEC_TREE_ENV_FIXTURE_WRITER_METHOD.DECISION,
  SPEC_TREE_ENV_FIXTURE_WRITER_METHOD.NODE,
  SPEC_TREE_ENV_FIXTURE_WRITER_METHOD.RAW,
] as const satisfies readonly SpecTreeEnvFixtureWriterMethod[];
