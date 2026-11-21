# Methodology Source

CONSTRAINS how context ingestion obtains the Outcome Engineering foundation
TO spx's shipped `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` bundle, selected from the exact methodology version the product declares and from the methodology bundle `--coding-agent` names or, without it, the bundle the bundle-by-identity Mapping yields, and read through `skills/understand/manifest.json` at schema version 1 with its singular `core` path resolved through the bundle containment boundary
SO THAT foundation selection stays offline and deterministic, with no other methodology layout, consumer copy, installed-plugin dependency or network lookup

## Test.Mapping: bundle-by-identity

Without `--coding-agent`, the methodology bundle follows agent identification under [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md); an agent's bundle is the one its agent module declares, and the default methodology bundle is the one an agent module marks as default.

| Case               | Agent identification                                      | Bundle                         |
| ------------------ | --------------------------------------------------------- | ------------------------------ |
| one-with-bundle    | one agent, whose module declares a bundle                 | that bundle                    |
| one-without-bundle | one agent, whose module declares none                     | the default methodology bundle |
| several            | two or more non-empty identity variables                  | the default methodology bundle |
| none-single        | no non-empty identity variable; the line ships one bundle | that bundle                    |
| none-several       | no non-empty identity variable; the line ships several    | fails as ambiguous             |

## Test.Compliance: projection

- manifest-schema: ALWAYS: the manifest schema is validated before output.
- core-containment: ALWAYS: core containment is validated before output.
- strict-utf8: ALWAYS: strict UTF-8 decoding is validated before output.
- compatibility: ALWAYS: configured `provides` and `supports` compatibility is validated before output.
- core-body: ALWAYS: the core body equals the strict UTF-8 body of the manifest-named resource after its front matter.
- show-output: ALWAYS: `show --methodology` frames the core's complete body after skill-runtime front matter as one Full document, whose displayed path is the bundle address followed by the manifest's `core` value relative to spx's package root, and emits no manifest, provenance record, reference, template or catalog entry.
- stable-display-path: NEVER: the displayed resource path is resolved against the consumer product root.
- core-relative-references: ALWAYS: a core-relative reference resolves against the bundle path carried by the core's document frame.

## Test.Mapping: methodology-failures

An absent or unsupported part of the selection fails the complete projection with the typed methodology failure.

| Case       | Absent or unsupported               | Result                    |
| ---------- | ----------------------------------- | ------------------------- |
| line       | the declared methodology line       | typed methodology failure |
| agent-tree | the selected bundle's tree          | typed methodology failure |
| manifest   | `skills/understand/manifest.json`   | typed methodology failure |
| schema     | a supported manifest schema version | typed methodology failure |
| core       | a core contained in the bundle      | typed methodology failure |

## Audit: selection

- selection-inputs: ALWAYS: tree selection is a function only of spx's package root, the declared methodology line, and either the `--coding-agent` bundle or agent identification with the default bundle mark of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md).
- no-fallback-source: NEVER: methodology selection falls back to another source, scans directories, compares package versions, reaches the network, reads an installed plugin or cache, or reads a consumer-side copy.
- pure-parsing: ALWAYS: methodology parsing and validation are pure over supplied bytes.
- injected-reader: ALWAYS: methodology tree reads enter through the injected methodology reader rooted at spx's package root.
