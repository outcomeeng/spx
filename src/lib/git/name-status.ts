import { compareAsciiStrings } from "@/lib/state-store";

export const GIT_NAME_STATUS_FLAG = "--name-status";
export const GIT_DIFF_FILTER_FLAG = "--diff-filter";
export const GIT_NULL_DELIMITED_FLAG = "-z";
export const GIT_DIFF_COMMAND = "diff";
export const GIT_RANGE_SEPARATOR = "..";

/** The `git diff --name-status -z <base>..<head>` argv that lists a changeset's changed paths. */
export function changesetNameStatusArgs(base: string, head: string): readonly string[] {
  return [GIT_DIFF_COMMAND, GIT_NAME_STATUS_FLAG, GIT_NULL_DELIMITED_FLAG, `${base}${GIT_RANGE_SEPARATOR}${head}`];
}
export const GIT_RENAME_STATUS_EXAMPLE = "R100";
export const GIT_COPY_STATUS_EXAMPLE = "C100";
export const GIT_MODIFY_STATUS_EXAMPLE = "M";
export const GIT_DELETE_STATUS_EXAMPLE = "D";
export const GIT_RENAMED_PATH_SUFFIX = ".renamed";

const GIT_RENAME_STATUS_PREFIX = "R";
const GIT_COPY_STATUS_PREFIX = "C";
export const GIT_NULL_RECORD_SEPARATOR = "\0";
const NULL_RECORD_SEPARATOR = GIT_NULL_RECORD_SEPARATOR;

function sortedPathSet(paths: ReadonlySet<string>): readonly string[] {
  return [...paths].sort(compareAsciiStrings);
}

function nulDelimitedFields(stdout: string): string[] {
  return stdout.split(NULL_RECORD_SEPARATOR).filter((field) => field.length > 0);
}

function pathsFromNulDelimitedNameStatus(stdout: string): readonly string[] {
  const paths = new Set<string>();
  const fields = nulDelimitedFields(stdout);
  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    index += 1;
    paths.add(fields[index]);
    index += 1;
    if (isTwoPathStatus(status)) {
      paths.add(fields[index]);
      index += 1;
    }
  }
  return sortedPathSet(paths);
}

function isTwoPathStatus(status: string): boolean {
  return status.startsWith(GIT_RENAME_STATUS_PREFIX) || status.startsWith(GIT_COPY_STATUS_PREFIX);
}

function pathsFromLineDelimitedNameStatus(stdout: string): readonly string[] {
  const paths = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    const fields = line.split("\t");
    const status = fields[0];
    if (isTwoPathStatus(status)) {
      for (const path of fields.slice(1)) paths.add(path);
      continue;
    }
    paths.add(fields.at(-1) ?? status);
  }
  return sortedPathSet(paths);
}

export function pathsFromNameStatus(stdout: string): readonly string[] {
  return stdout.includes(NULL_RECORD_SEPARATOR)
    ? pathsFromNulDelimitedNameStatus(stdout)
    : pathsFromLineDelimitedNameStatus(stdout);
}

export function pathsFromNulDelimited(stdout: string): readonly string[] {
  return nulDelimitedFields(stdout).sort(compareAsciiStrings);
}
