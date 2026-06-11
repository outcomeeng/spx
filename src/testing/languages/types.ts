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
}

/** Dependencies injected into a language runner's detection and invocation paths. */
export interface TestRunnerDependencies {
  /** Reports whether the language is present at the given project root. */
  readonly isLanguagePresent: (projectRoot: string) => boolean;
  /** Executes a command, returning its terminal exit code. */
  readonly runCommand: (command: string, args: readonly string[]) => Promise<TestRunCommandResult>;
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

/** Outcome of a `runTests` call: whether the runner was invoked and its exit code. */
export interface TestRunInvocation {
  /** False when detection gated the runner out; true when the runner ran. */
  readonly invoked: boolean;
  /** The runner's exit code; absent when the runner was not invoked. */
  readonly exitCode?: number;
}

/** A language's test-runner participation: detection, patterns, exclusion flags, and invocation. */
export interface TestingLanguageDescriptor {
  /** Language identity (e.g. the language whose descriptor module this is). */
  readonly name: string;
  /** Test-file patterns this language's runner targets. */
  readonly testFilePatterns: readonly string[];
  /** Product-root files whose content influences this language's runner behavior. */
  readonly productInputPaths: readonly string[];
  /** Whether a file path is one of this language's test files. */
  matchesTestFile(filePath: string): boolean;
  /** Maps an excluded node path to the runner's exclusion flag. */
  excludeFlag(nodePath: string): string;
  /** Whether the language is present at the project root, via injected detection. */
  detect(projectRoot: string, deps: Pick<TestRunnerDependencies, "isLanguagePresent">): boolean;
  /** Invokes the runner, gated on detection, through the injected command runner. */
  runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation>;
}
