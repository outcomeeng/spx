// Shared production metadata for spec-tree fixture writer methods.
// Literal validation imports this registry to classify test-authored setup data.
export const SPEC_TREE_ENV_FIXTURE_WRITER_METHODS = [
  "writeDecision",
  "writeNode",
  "writeRaw",
] as const satisfies readonly string[];

export type SpecTreeEnvFixtureWriterMethod = (typeof SPEC_TREE_ENV_FIXTURE_WRITER_METHODS)[number];
