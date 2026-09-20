# Open Issues

## The harness-environment defaults check names a test-invented key

**Evidence:** `tests/methodology-config.compliance.l1.test.ts` asserts `expect(HARNESS_ENVIRONMENT_CONFIG_FIELDS).not.toHaveProperty("METHODOLOGY")`; no production module declares that registry key, so the check passes whatever key the harness-environment descriptor would use for a methodology default and adds nothing beyond the preceding `defaults` check. The same file composes the location-field rejection path from the generator-owned constant `METHODOLOGY_LOCATION_FIELD` where the sibling malformed-rejection observations carry the offending field on the observation. `observeMethodologyConfigFormatsResolveEquivalently` derives its expected section through `methodologyConfigDescriptor.validate`, the validator every per-format parse applies, and the mapping test iterates the observed formats without asserting the set equals `CONFIG_FILE_FORMAT`. `generatedMethodologySource` draws through the unseeded `sampleConfigTestValue`.

**Impact:** one predicate encodes a vocabulary guess; the format-equivalence oracle shares the validator with the path under test; a failing source draw carries no replay seed.

**Settlement condition:** the defaults check derives its violating token from the source contract (`Object.values(HARNESS_ENVIRONMENT_CONFIG_FIELDS)` against `METHODOLOGY_SECTION`) or is dropped; the location case reads its field from the observation; the format observation compares against the generated section and the test asserts the format set equals `CONFIG_FILE_FORMAT`; the source generator draws through the seeded sampler.
