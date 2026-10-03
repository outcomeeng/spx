import { unknownBuildIdentity } from "@/lib/build-identity";

/**
 * Replaced by the build with the identity computed when `dist/` was built; undeclared at run time in
 * an unbuilt source invocation.
 */
declare const __SPX_BUILD_IDENTITY__: string | undefined;

/** The build identity stamped into this executable, or the unknown identity when none was stamped. */
export function stampedBuildIdentity(packageVersion: string): string {
  return typeof __SPX_BUILD_IDENTITY__ === "string" ? __SPX_BUILD_IDENTITY__ : unknownBuildIdentity(packageVersion);
}
