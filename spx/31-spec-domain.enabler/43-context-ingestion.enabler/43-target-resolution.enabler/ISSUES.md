# Open Issues

## A missing candidate under a symlinked invocation spelling reads as outside the product

**Evidence:** `operandFacts` in `src/commands/spec/context-input.ts` confines a candidate that does not exist by comparing its lexical path with `input.productDir`, the root git reports in canonical form. When the invocation directory is spelled through a symbolic link — a macOS temporary directory under `/var`, which resolves to `/private/var` — every missing invocation-relative and product-root candidate lies lexically outside that root, so the operand fails as outside the product instead of unresolved or unsupported. The rejected-target cases of `tests/context-target-resolution.mapping.l1.test.ts`, run inside a git repository from the temporary directory's `/var` spelling, reported `Spec context target is outside the product` for an unknown directory and for every unsupported artifact; the cases now resolve their invocation directory through the product's canonical path.

**Impact:** a caller whose working directory reaches the product through a symbolic link receives an outside-product diagnostic for a target that is merely unknown or unsupported, and confinement depends on how the invocation directory is spelled rather than where it resolves.

**Settlement condition:** confinement of a missing candidate resolves its nearest existing ancestor through symbolic links before comparing it with the resolved product root, and the compliance evidence covers an unknown operand supplied from a symlinked spelling of the invocation directory.
