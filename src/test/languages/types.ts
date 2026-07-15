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

/** A unit of test coverage a journal-streaming run reports: one test module. */
export interface TestScopeUnit {
  /** The module identity (its resolved file path). */
  readonly moduleId: string;
}

/** A validated problem a journal-streaming run reports: one failing test case. */
export interface TestFinding {
  /** The module the failing case belongs to. */
  readonly moduleId: string;
  /** The failing case's full name within its module. */
  readonly testName: string;
  /** The error messages the case failed with. */
  readonly errors: readonly string[];
}

/**
 * The evidence-append port a journal-streaming run forwards scope and finding events to. Each
 * append is awaitable so a sink backed by asynchronous journal writes completes its write before
 * the run advances; a synchronous sink returns `void` and is awaited to no effect. Language-neutral:
 * the verification executor backs this port with the recorder's evidence-append operations without
 * naming a language.
 */
export interface TestRunEvidenceSink {
  /** Records that a test module was covered by the run. */
  appendScope(unit: TestScopeUnit): void | Promise<void>;
  /** Records that a test case failed. */
  appendFinding(finding: TestFinding): void | Promise<void>;
}

/** Terminal statuses a journal-streaming run yields for the consumer to seal with. */
export const JOURNAL_RUN_TERMINAL_STATUS = {
  PASSED: "passed",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
} as const;

/** Terminal status a journal-streaming run yields for the consumer to seal with. */
export type JournalRunTerminalStatus = (typeof JOURNAL_RUN_TERMINAL_STATUS)[keyof typeof JOURNAL_RUN_TERMINAL_STATUS];

/** The scope a journal-streaming run covers: the project root and the test paths to run. */
export interface JournalRunRequest {
  /** Project root the run executes against. */
  readonly projectRoot: string;
  /** Test file paths the run covers; empty runs the runner's full scope. */
  readonly testPaths: readonly string[];
}

/** Dependencies a language's journal-streaming run is driven with through the descriptor: the evidence sink it streams into. */
export interface JournalStreamRunDependencies {
  /** The evidence-append port the run streams per-module scope and per-failing-case findings into. */
  readonly sink: TestRunEvidenceSink;
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
  /**
   * Drives a journal-streaming run over the request's scope, streaming per-module scope and
   * per-failing-case findings into the injected sink and yielding the run's terminal status. A
   * language-neutral consumer reaches this through the testing registry without naming the runner.
   */
  runTestsStreaming?(
    request: JournalRunRequest,
    deps: JournalStreamRunDependencies,
  ): Promise<JournalRunTerminalStatus>;
}
