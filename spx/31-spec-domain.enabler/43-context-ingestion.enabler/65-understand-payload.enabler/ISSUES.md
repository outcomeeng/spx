# Open Issues

## The payload reads an installed package from the consumer's directory

**Evidence:** `21-methodology-source.adr.md` decides that the payload reads
"the foundation-resource manifest of the installed methodology package,"
located through `methodology.packageDir`, and that "spx embeds no foundation
snapshot." `src/commands/spec/context.ts` resolves that path against the
consumer's `productDir`. The tree the payload serves is spx's shipped asset
at `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/`, resolved from spx's
package root by the consumer's declared `version` and the coding agent in
scope; a consumer installs and commits nothing. The four tests under
`tests/` build a `methodology-package` fixture in the product directory.

**Impact:** the foundation an agent receives depends on which package is
installed at a configured location on that machine, so the same product
revision yields different foundations on different hosts and none in CI.

**Settlement condition:** the ADR decides that the payload reads spx's own
tree, addressed by the declared methodology line and the coding agent in
scope, from spx's package root; `--coding-agent` names the agent when more
than one tree ships; the reader fails naming the missing tree when the
declared line is not shipped; the tests fixture spx's tree, not a package in
the product directory.

## The spec names the wrong reason for the payload

**Evidence:** `understand-payload.md` reads "SO THAT Skill-less agents
consuming `spx/31-spec-domain.enabler/43-context-ingestion.enabler` output
CAN satisfy the foundation contract." Every coding agent has skills. The
payload exists so that one deterministic command returns the foundation body
and the product context bundle together, once, in place of loading a skill
whose file is mostly workflow prose around the foundation and then walking
the tree by hand, and so that the foundation an agent loads is the one the
product declares rather than the one its machine happens to have installed.

**Impact:** a reader of the spec designs for an agent class that does not
exist and misses the two properties the command is measured by: tokens per
context load, and version match with the product declaration.

**Settlement condition:** the SO THAT clause names token efficiency of one
combined deterministic payload and version match with the declared
methodology as the purpose.
