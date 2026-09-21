# Issues

## A previous-release reference inside a larger token has no declared outcome

`assertUnrelatedVersionTokensPreserved` in [documentation-sync.ts](../../../src/domains/release/documentation-sync.ts) rejects a staged document when any whitespace-delimited token of the original that matches the semantic-version pattern no longer appears in the updated content, exempting only the exact standalone previous-version token and its tag-prefixed form. A previous-release reference carrying adjacent punctuation — `1.2.3.` at a sentence end, `(1.2.3)`, `spx@1.2.3,` — is therefore a protected token: a producer that rewrites it to the released version fails the composition deterministically, and a producer that leaves it ships a stale reference. The producer prompt carries two instructions that pull in different directions for such a token — update every version reference to match the release data, and replace every standalone previous-version reference — and [21-documentation-sync.adr.md](21-documentation-sync.adr.md) states only the stale-reference predicate for the exact standalone token, not what a larger token embedding the previous version must become.

**Evidence:** the changeset review of the release product-context branch at `a3f90bc60dfd626d29151a0a0a8461055c1fea95` (review run `2026-09-20_21-06-22-273-9ddbc84f0bb1`, finding F-003) traced the validator, the two prompt instructions, and the ADR invariant; the generated protected-token property in [documentation-sync.property.l1.test.ts](tests/documentation-sync.property.l1.test.ts) draws protected tokens only from the released version or an unrelated version, never from the previous version with punctuation.

**Impact:** a documentation set whose previous-release references sit inside punctuation either fails documentation sync or keeps stale references, and no test distinguishes the two outcomes.

**Settlement condition:** the ADR and the spec property declare what a previous-release reference embedded in a larger non-whitespace token becomes; the validator and the producer prompt agree with that declaration; and a generated case draws a punctuated previous-version token.
