/**
 * The caller-driven scope option grammar the scope-grammar Mapping of
 * `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler/record-run.md`
 * states, copied from the Mapping rather than from the descriptor that registers the options: the two
 * option flags, and for each public form the scope type and the term that names its scope identity —
 * the `<base>..<head>` range of a changeset, and the product-relative path of a file.
 */
export const SCOPE_GRAMMAR_MAPPING = {
  scopeTypeFlag: "--scope-type",
  scopeFlag: "--scope",
  forms: [
    { scopeType: "changeset", scopeTerm: "<base>..<head>" },
    { scopeType: "file", scopeTerm: "product-relative" },
  ],
  resolvedScopeField: "resolvedScope",
} as const;
