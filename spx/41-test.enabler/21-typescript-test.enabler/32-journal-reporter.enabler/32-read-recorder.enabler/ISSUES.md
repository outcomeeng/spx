# Open Issues

## The bundled read-recorder setup file binds to a Vitest copy that may not be the product's

`src/test/languages/read-recorder-setup.ts` is bundled into `dist/read-recorder-setup.js` and imports `afterAll` and `TestRunner` from `"vitest"`. `vitest` is a devDependency of this package, and the streaming run deliberately resolves the Vitest Node API from the product under test. How `"vitest"` resolves for a setup file living in the installed spx package is unverified. When it resolves to no module (spx installed globally, or the product's Vitest not hoisted), the setup file throws. When it resolves to a different Vitest copy than the product's worker, its `afterAll` and `TestRunner.getCurrentSuite` bind to a runner that does not execute the module, so the metadata is never written.

**Evidence:** `src/test/languages/read-recorder-setup.ts`; the L2 tests in this node run inside this repository, where one Vitest copy exists, so they cannot expose either resolution.

**Impact:** over such a product every Vitest 4.0 test result degrades to not-run.

**Settlement condition:** evidence from a product whose Vitest is a separate installation from spx's own (including a globally installed spx) shows the setup file records read paths through the product's Vitest, or a decision states how the setup file resolves Vitest and the product Vitest versions it supports.
