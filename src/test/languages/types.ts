/**
 * Language descriptor contract for the testing registry.
 *
 * Each language declares its test-runner participation through a typed
 * descriptor: a presence predicate, the test-file patterns it owns, a pure
 * exclusion-flag generator, and a `runTests` operation that invokes the runner
 * through an injected command runner. Composing these descriptors into a registry
 * and dispatching the `spx test` command are separate, higher-level concerns.
 */

/** Result of a single command-runner invocation. */
export interface TestRunCommandResult {
  readonly exitCode: number;
  readonly output?: TestRunCommandOutput;
}

/** File artifacts containing a command runner's raw output streams. */
export interface TestRunCommandOutput {
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly failingTestPaths?: readonly string[];
}

/** Dependencies injected into a language runner's detection and invocation paths. */
export interface TestRunnerDependencies {
  /** Optional test override for descriptor-owned language presence detection. */
  readonly isLanguagePresent?: (projectRoot: string) => boolean;
  /** Executes a command, returning its terminal exit code. */
  readonly runCommand: (command: string, args: readonly string[]) => Promise<TestRunCommandResult>;
}

/** Result from a related-test resolver command that emits parseable stdout. */
export interface RelatedTestCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Related-test resolver output: test-file operands plus the source files they cover. */
export interface RelatedTestResolution {
  readonly testPaths: readonly string[];
  readonly resolvedSourcePaths: readonly string[];
}

/** Dependencies injected into a language's related-test resolver. */
export interface RelatedTestDependencies {
  readonly isLanguagePresent?: (projectRoot: string) => boolean;
  readonly runCommand: (command: string, args: readonly string[]) => Promise<RelatedTestCommandResult>;
  readonly readFile: (path: string) => Promise<string>;
}

/** Request to resolve source files to related test file paths. */
export interface RelatedTestRequest {
  readonly projectRoot: string;
  readonly sourcePaths: readonly string[];
  readonly candidateTestPaths: readonly string[];
  readonly baseRef: string;
}

/** A request to run a language's tests over a set of discovered paths. */
export interface TestRunRequest {
  /** Project root passed to the runner as its working root. */
  readonly projectRoot: string;
  /** Discovered test file paths to run; empty runs the runner's full scope. */
  readonly testPaths: readonly string[];
  /** Node paths excluded from the passing scope, mapped to runner exclusion flags. */
  readonly excludedNodePaths: readonly string[];
}

/** Outcome of a `runTests` call: gated out, or invoked with its terminal exit code. */
export type TestRunInvocation =
  | {
    /** Detection gated the runner out before invocation. */
    readonly invoked: false;
  }
  | {
    /** The runner ran and returned this terminal exit code. */
    readonly invoked: true;
    readonly exitCode: number;
    readonly output?: TestRunCommandOutput;
  };

/** A language's test-runner participation: detection, patterns, exclusion flags, and invocation. */
export interface TestingLanguageDescriptor {
  /** Language identity (e.g. the language whose descriptor module this is). */
  readonly name: string;
  /** Test-file patterns this language's runner targets. */
  readonly testFilePatterns: readonly string[];
  /** Product-root files whose content influences this language's runner behavior. */
  readonly productInputPaths: readonly string[];
  /** Product-root files derived from covered test paths whose content influences this language's runner behavior. */
  readonly coveredProductInputPaths?: (coveredTestPaths: readonly string[]) => readonly string[];
  /** Whether a file path is one of this language's test files. */
  matchesTestFile(filePath: string): boolean;
  /** Maps an excluded node path to the runner's exclusion flag. */
  excludeFlag(nodePath: string): string;
  /** Whether the language is present at the project root. */
  detect(projectRoot: string, deps?: Pick<TestRunnerDependencies, "isLanguagePresent">): boolean;
  /** Invokes the runner, gated on detection, through the injected command runner. */
  runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation>;
  /** Resolves source files to related test file paths without running those tests. */
  relatedTestPaths?(
    request: RelatedTestRequest,
    deps: RelatedTestDependencies,
  ): Promise<RelatedTestResolution>;
}
