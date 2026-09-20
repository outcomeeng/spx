# Open Issues

## Provider match compares `provides` to the declared version by string equality

**Evidence:** `checkProviderMatch` in `src/lib/methodology/provider-match.ts` rejects a declaration when `plugin.provides !== input.version`. `spx/13-agent-capability-lifecycle.pdr.md` admits both `MAJOR.MINOR` and `MAJOR.MINOR.PATCH` as exact methodology versions and requires the declared version and `methodology.provides` to select the same `MAJOR.MINOR` line, so a product declaring `4.0.0` against a provider declaring `provides: "4.0"` — or the reverse — is a match by the decision and a mismatch by the code. The shipped `methodology/4.0/source.json` declares no `provides`, so every current match reports `undeclared` and no consumer observes the divergence.

**Impact:** once a fetched line records a `provides` in the other form, `spx spec context show --methodology`, compact recovery, and the diagnose methodology-context check fail a product whose declaration selects the provided line.

**Settlement condition:** `checkProviderMatch` compares the two declarations by their `MAJOR.MINOR` line, the `supports` range check accepts a `MAJOR.MINOR` migration source, and a linked test under this node or the config node exercises a `provides` in each form against a declaration in the other.
