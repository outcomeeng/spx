/** A packaged artifact and the source entrypoints the build compiles into it. */
export interface SourceArtifactDescriptor {
  readonly descriptorPath: string;
  readonly runtimeExecutable: string;
  readonly launcherPath: string;
  readonly invocationFlags: {
    readonly version: string;
  };
  readonly sourceEntrypointPaths: readonly string[];
}

/** Source-owned contract for the packaged SPX command-line artifact. */
export const PACKAGED_CLI_ARTIFACT = {
  descriptorPath: "src/interfaces/cli/artifact.ts",
  runtimeExecutable: "node",
  launcherPath: "bin/spx.js",
  invocationFlags: {
    version: "--version",
  },
  sourceEntrypointPaths: ["src/cli.ts"],
} as const satisfies SourceArtifactDescriptor;
