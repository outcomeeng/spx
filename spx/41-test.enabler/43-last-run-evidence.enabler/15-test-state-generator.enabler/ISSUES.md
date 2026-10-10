# Issues: Test-Run-State Generator

## Property tests call fast-check directly, bypassing the property harness's seed and replay

`tests/test-state-generator.property.l1.test.ts` runs each of its two properties through `fc.assert(fc.property(...))` with fast-check's default run count, not through the property harness in `testing/harnesses/property/property.ts`. That harness owns the run count, the per-run timeout, and the seed: it reads `SPX_PROPERTY_SEED` or draws one, and a failure reports the seed and the shrunk counterexample so the caller replays the exact run. A failing property in this file reports fast-check's own seed text and ignores `SPX_PROPERTY_SEED`.

**Impact:** a failure in either property does not replay through the pinned seed every other property in the product uses, and the run count and timeout are fast-check defaults, so the properties' budgets drift from the harness's.

**Scope:** the two properties in the file, "draws every generated status from the source-owned status set" and "produces non-empty, disjoint test-path pairs"; this changeset leaves their `fc.assert` calls unchanged.

**Settlement condition:** both properties run through the property harness, and this node's tests and its test-evidence audit pass.

## Generators redeclare head-SHA, run-id, and digest shapes that production owns or should own

`testing/generators/testing/run-state.ts` declares three regular expressions at lines 25-27: `HEAD_SHA_PATTERN` (`/^[a-f0-9]{40}$/`), `RUN_ID_PATTERN` (`/^[a-f0-9]{12}$/`), and `DIGEST_PATTERN` (`/^[a-f0-9]{64}$/`). It feeds them to `fc.stringMatching` in `arbitraryHeadSha` (line 83), `arbitraryRunId` (line 87), and `arbitraryDigest` (line 91). The run identifier shape is owned by production: `RUN_TOKEN_PATTERN` in `src/lib/state-store/index.ts` (line 184, a module-private constant) ends in a 12-character lowercase hexadecimal run id, and `generateRunId` in the same file derives that id from `STATE_STORE_RUN_TOKEN.ID_BYTES` (6) random bytes rendered as hexadecimal. Production exports neither the run-id shape nor the run-token pattern. Production declares no exported head-SHA or digest shape: `src/test/run-state.ts` carries `headSha` as an unconstrained string and produces digests through `digestTestPaths` and `digestTestContents`, which call a private `sha256Hex` (line 578); `src/lib/state-store/index.ts` exports its own `sha256Hex` (line 817); and neither module reads a git head. A separate, unexported `VERIFY_HEAD_COMMIT_PATTERN` in `src/domains/verify/verify.ts` (line 2017) accepts 40 or 64 hexadecimal characters for a different consumer. A test-evidence audit of this node, on its first run, rejected the three patterns as the generator copying source-owned shapes (finding f-003). [spx/12-test-infrastructure.adr.md](spx/12-test-infrastructure.adr.md) forbids test infrastructure that redeclares production protocol values, command vocabulary, schema fields, status values, or path grammar. The patterns predate the Change that added the run-state scenario construction, and that Change left them untouched.

**Impact:** a change to the run-id width, the digest algorithm, or the accepted head-SHA length in production leaves the generators drawing values of the old shape, so properties and scenarios exercise values production no longer produces and the generator never fails to signal the drift.

**Scope:** the three patterns and their three generators in `testing/generators/testing/run-state.ts`; the head-SHA and digest shapes, for which production exports no owner; the node's test-evidence audit finding f-003.

**Settlement condition:** the generators take the head-SHA, run-id, and digest shapes from their production owners, or, where production declares none, each shape gets one production owner that the generator imports, and this node's tests and its test-evidence audit pass.
