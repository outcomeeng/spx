# Open Issues

## The retired `--understand` option on `show` has no declared rejection

`spx spec context show` replaced its `--understand` option with `--methodology`. The contract-tests scenario "rejects `--content` on `show`" and its case in `tests/spec-cli-contract.scenario.l2.test.ts` cover `--content` alone. No assertion of this node, of [`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`](../54-spec-cli-commands.enabler/spec-cli-commands.md), or of [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.adr.md`](../43-context-ingestion.enabler/32-context-manifest-schema.adr.md) states that `show` rejects `--understand`. A rejection case filed under the `--content` assertion would claim behavior that assertion does not state.

**Evidence:** the CI review of head `fcecf1ef4` recorded it as a DEBT finding on `src/interfaces/cli/spec.ts`. The finding asks for a retired `--understand` fixture and a matching L2 contract case.

**Impact:** a later change could re-admit `--understand` as an alias or a separate mode. Every linked test would still pass.

**Settlement condition:** an assertion declares that `show` rejects the retired `--understand` option before any output, and a packaged-executable case linked from that assertion exercises it.
