import { describe, expect, it } from "vitest";

import { readBuildIdentity, unknownBuildIdentity } from "@/lib/build-identity";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  BUILD_COMMIT_TAG_RELATION,
  BUILD_WORKING_TREE_STATE,
  sampleBuildVersions,
} from "@testing/generators/cli/build-identity";
import {
  readProductPackageVersion,
  runPackagedVersion,
  withBuildCheckout,
} from "@testing/harnesses/cli/build-identity";
import { CLI_TIMEOUTS_MS, PRODUCT_ROOT } from "@testing/harnesses/constants";

describe("Compliance: the built executable reports the identity stamped at build time", () => {
  it(
    "prints one identity from the product checkout, from another Git checkout, and from outside any checkout",
    async () => {
      const packageVersion = await readProductPackageVersion();
      const fromProduct = await runPackagedVersion(PRODUCT_ROOT);

      await withBuildCheckout({ insideCheckout: false }, sampleBuildVersions(), async (outside) => {
        const fromOutside = await runPackagedVersion(outside.dir);

        expect(fromOutside).toBe(fromProduct);
        expect(fromOutside).not.toBe(unknownBuildIdentity(packageVersion));
      });

      await withBuildCheckout(
        {
          insideCheckout: true,
          tagRelation: BUILD_COMMIT_TAG_RELATION.UNTAGGED,
          workingTree: BUILD_WORKING_TREE_STATE.MODIFIED,
        },
        sampleBuildVersions(),
        async (foreign) => {
          const fromForeign = await runPackagedVersion(foreign.dir);

          expect(fromForeign).toBe(fromProduct);
          expect(fromForeign).not.toBe(await readBuildIdentity(packageVersion, foreign.dir, defaultGitDependencies));
        },
      );

      expect(fromProduct.startsWith(packageVersion)).toBe(true);
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
