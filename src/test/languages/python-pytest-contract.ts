/** pytest exclusion-flag format: an excluded node path maps to `--ignore=spx/{nodePath}/`. */
export const PYTHON_PYTEST_IGNORE_FLAG_PREFIX = "--ignore=spx/";
export const PYTHON_PYTEST_IGNORE_FLAG_SUFFIX = "/";

// pytest runs through `uv run --active` so the provisioned active Python environment provides the tool;
// pytest takes its rootdir, configuration, and environment from the command runner's working directory.
export const UV_COMMAND = "uv";
export const PYTEST_INVOKE_ARGS = ["run", "--active", "pytest"] as const;

// pytest writes its JUnit XML report to a run-scoped file under the run's `.spx/worktree/test/` location.
export const JUNIT_REPORT_FLAG_PREFIX = "--junitxml=";
export const JUNIT_REPORT_DIRECTORY = "reports";
export const JUNIT_REPORT_FILE_PREFIX = "pytest-";
export const JUNIT_REPORT_FILE_SUFFIX = ".xml";
export const JUNIT_REPORT_TEXT_ENCODING = "utf8";
/** Exit code an invocation reports when it exits zero yet leaves no readable report. */
export const JUNIT_UNREADABLE_REPORT_EXIT_CODE = 1;
