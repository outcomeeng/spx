# Known Issues: 76-node-state-derivation.enabler

## The state-derivation mapping never combines evidence entries

**Evidence:** `tests/node-state-derivation.mapping.l1.test.ts` line 29 declares the four-row evidence-to-state table in the test body and loops over it inside one `it`, and each row passes a single evidence entry. Mixed combinations, such as failing evidence beside passing evidence or passing evidence beside linked evidence, never run.

**Impact:** a mutation of the precedence among evidence outcomes in `deriveState` survives, and one failing row hides the rows after it.

**Settlement condition:** the mapping runs through `it.each` over a complete derived domain that includes evidence combinations, with the expected state derived from the precedence the spec declares.
