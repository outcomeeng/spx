# Open Issues

## The accepted loaded-methodology declaration is exercised only where it is rejected

The scenario `The packaged executable accepts caller-declared loaded product, target, and methodology context, suppresses only entries covered at a sufficient projection mode, and rejects incompatible methodology flags` claims the executable accepts a caller-declared loaded methodology. `SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION` appears in the linked evidence only inside the rejected `--methodology --loaded-methodology` pairing, so no exit-zero invocation carries it. The accepted clause is proven for `--loaded-product` and `--loaded-target` alone.

**Evidence:** the test-evidence audit of this node at `e372f08c66ebaa9afbf1363be34378fa01ad512f` returned `REJECTED` with finding `f-001`, rule `scope`, against `tests/spec-cli-contract.scenario.l2.test.ts:166`; `resolveContextShow` in `src/commands/spec/context-show.ts` reads `loadedMethodology` only in its mutual-exclusion guard.

**Impact:** removing `--loaded-methodology` from the descriptor's accepted option surface would leave the exclusivity case as the only evidence naming it, and the accepted half of the claim would fail unobserved.

**Settlement condition:** the linked evidence drives the packaged executable through an exit-zero invocation carrying `--loaded-methodology` and observes the projection it declares.
