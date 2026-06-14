/** pytest exclusion-flag format: an excluded node path maps to `--ignore=spx/{nodePath}/`. */
export const PYTHON_PYTEST_IGNORE_FLAG_PREFIX = "--ignore=spx/";
export const PYTHON_PYTEST_IGNORE_FLAG_SUFFIX = "/";

// pytest runs through `uv run --active` so the provisioned active Python environment provides the tool;
// pytest takes its rootdir, configuration, and environment from the command runner's working directory.
export const UV_COMMAND = "uv";
export const PYTEST_INVOKE_ARGS = ["run", "--active", "pytest"] as const;
