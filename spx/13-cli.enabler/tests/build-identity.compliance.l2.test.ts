import { describe, expect, it } from "vitest";

import {
  BUILD_COMMIT_TAG_RELATION,
  BUILD_WORKING_TREE_STATE,
  expectedBuildIdentity,
  sampleBuildVersions,
} from "@testing/generators/cli/build-identity";
import {
  readProductCheckoutBuildState,
  readProductPackageVersion,
  runPackagedVersion,
  withBuildCheckout,
} from "@testing/harnesses/cli/build-identity";
import { CLI_TIMEOUTS_MS, PRODUCT_ROOT } from "@testing/harnesses/constants";

describe("Compliance: the built executable reports the identity stamped at build time", () => {
  it(
    "prints the identity of the checkout state it was built from, from the product checkout, another Git checkout, and outside any checkout",
    async () => {
      const packageVersion = await readProductPackageVersion();
      const built = await readProductCheckoutBuildState(packageVersion);
      const fromProduct = await runPackagedVersion(PRODUCT_ROOT);

      expect(fromProduct).toBe(expectedBuildIdentity(packageVersion, built.state, built.headCommit));

      await withBuildCheckout({ insideCheckout: false }, sampleBuildVersions(), async (outside) => {
        expect(await runPackagedVersion(outside.dir)).toBe(fromProduct);
      });

      await withBuildCheckout(
        {
          insideCheckout: true,
          tagRelation: BUILD_COMMIT_TAG_RELATION.UNTAGGED,
          workingTree: BUILD_WORKING_TREE_STATE.MODIFIED,
        },
        sampleBuildVersions(),
        async (foreign) => {
          expect(await runPackagedVersion(foreign.dir)).toBe(fromProduct);
        },
      );
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
