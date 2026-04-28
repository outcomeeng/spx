import type { Config } from "@/spec/testing/index";
import type { SpecTreeEnv } from "@/spec/testing/index";

export const INTEGRATION_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

export const SPX_ROOT_SEGMENT = "spx";
export const EXCLUDE_FILENAME = `${SPX_ROOT_SEGMENT}/EXCLUDE`;

export const NODE_SEGMENT_SIMPLE = "21-shallow-sample.enabler";
export const NODE_SEGMENT_NESTED_PARENT = "41-validation.enabler";
export const NODE_SEGMENT_NESTED_CHILD = "65-markdown-validation.enabler";
export const NODE_SEGMENT_NESTED = `${NODE_SEGMENT_NESTED_PARENT}/${NODE_SEGMENT_NESTED_CHILD}`;
export const NODE_SEGMENT_OTHER = "32-sibling-sample.enabler";

export const SUBPATH_IMPL = "impl.ts";
export const SUBPATH_TEST_SHALLOW = "tests/a.test.ts";
export const SUBPATH_TEST_DEEP = "tests/sub/deep.test.ts";
export const SUBPATH_DOC = "docs/note.md";
export const SUBPATH_TEST_FOO = "tests/foo.test.ts";
export const SUBPATH_TEST_BAR = "tests/bar.test.ts";

export const COMMENT_HEADER = "# header comment";
export const COMMENT_INDENTED = "  # indented comment";
export const COMMENT_MIDDLE = "# middle comment";

export const INVALID_EXCLUDE_ENTRIES = [
  "/absolute/node.enabler",
  "../outside-spx",
  "21-example.enabler/../escape",
  "./21-example.enabler",
  "21-example.enabler/../..",
] as const;

export const ARBITRARY_SEGMENT_MAX = 3;
export const ARBITRARY_QUERY_MAX = 4;
export const PROPERTY_NUM_RUNS = 16;

export function spxPath(segment: string, ...rest: string[]): string {
  return [SPX_ROOT_SEGMENT, segment, ...rest].join("/");
}

export function excludeContents(lines: readonly string[]): string {
  return lines.join("\n");
}

export async function writeExclude(
  env: SpecTreeEnv,
  lines: readonly string[],
): Promise<void> {
  await env.writeRaw(EXCLUDE_FILENAME, excludeContents(lines));
}

export async function writeExcludeRaw(
  env: SpecTreeEnv,
  contents: string,
): Promise<void> {
  await env.writeRaw(EXCLUDE_FILENAME, contents);
}

export const SUBPATHS_FOR_PREFIX_CHECK = [
  SUBPATH_IMPL,
  SUBPATH_TEST_SHALLOW,
  SUBPATH_TEST_DEEP,
  SUBPATH_DOC,
] as const;

export const TOOL_PYTEST = "pytest";
export const TOOL_VITEST = "vitest";

export function expectedPytestFlag(segment: string): string {
  return `--ignore=${spxPath(segment)}/`;
}

export function expectedVitestFlag(segment: string): string {
  return `--exclude=${spxPath(segment)}/**`;
}
