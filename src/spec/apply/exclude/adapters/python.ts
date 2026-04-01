/**
 * Python language adapter for apply-exclude.
 *
 * Applies spec-tree exclusions to pyproject.toml using string-based editing.
 * Preserves comments and formatting by only modifying the specific values
 * for pytest addopts, mypy exclude, and pyright exclude — everything else
 * is left untouched.
 */
import { isExcludedEntry, toMypyRegex, toPyrightPath, toPytestIgnore } from "../mappings.js";
import type { ApplyResult } from "../types.js";
import type { LanguageAdapter } from "./types.js";

/** Config file name for Python projects */
export const PYTHON_CONFIG_FILE = "pyproject.toml";

/** TOML section header for pytest configuration */
export const PYTEST_SECTION = "tool.pytest.ini_options";

/** TOML section header for mypy configuration */
export const MYPY_SECTION = "tool.mypy";

/** TOML section header for pyright configuration */
export const PYRIGHT_SECTION = "tool.pyright";

/** Indentation used for new array entries */
const ARRAY_INDENT = "    ";

/**
 * Update pytest addopts string value within pyproject.toml content.
 *
 * Finds `addopts = "..."` in `[tool.pytest.ini_options]`, filters out
 * old excluded entries, and appends new ones.
 */
function updatePytestAddopts(content: string, nodes: string[]): string {
  const sectionPattern = new RegExp(`^\\[${PYTEST_SECTION.replace(/\./g, "\\.")}\\]`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) return content;

  // Find addopts = "..." after the section header
  const afterSection = content.slice(sectionMatch.index);
  const addoptsPattern = /^([ \t]*addopts\s*=\s*")((?:[^"\\]|\\.)*)(")/m;
  const addoptsMatch = addoptsPattern.exec(afterSection);
  if (!addoptsMatch) return content;

  const prefix = addoptsMatch[1];
  const currentValue = addoptsMatch[2];
  const suffix = addoptsMatch[3];

  // Split by whitespace, filter old excluded entries, add new ones
  const parts = currentValue.split(/\s+/).filter((p) => p.length > 0);
  const kept = parts.filter((p) => !isExcludedEntry(p));
  const newIgnores = nodes.map(toPytestIgnore);
  const updatedValue = [...kept, ...newIgnores].join(" ");

  const absoluteStart = sectionMatch.index + addoptsMatch.index;
  const absoluteEnd = absoluteStart + addoptsMatch[0].length;

  return content.slice(0, absoluteStart) + prefix + updatedValue + suffix + content.slice(absoluteEnd);
}

/**
 * Find the boundaries of a TOML array value within a specific section.
 */
function findTomlArray(
  content: string,
  sectionHeader: string,
  key: string,
): { arrayStart: number; arrayEnd: number } | null {
  const sectionPattern = new RegExp(`^\\[${sectionHeader.replace(/\./g, "\\.")}\\]`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) return null;

  // Find key = [ after section header, before next section
  const afterSection = content.slice(sectionMatch.index);
  const nextSectionMatch = /^\[(?!.*\].*=)/m.exec(afterSection.slice(sectionMatch[0].length));
  const sectionEnd = nextSectionMatch
    ? sectionMatch.index + sectionMatch[0].length + nextSectionMatch.index
    : content.length;

  const keyPattern = new RegExp(`^([ \\t]*${key}\\s*=\\s*)\\[`, "m");
  const regionToSearch = content.slice(sectionMatch.index, sectionEnd);
  const keyMatch = keyPattern.exec(regionToSearch);
  if (!keyMatch) return null;

  const arrayStart = sectionMatch.index + keyMatch.index + keyMatch[1].length;

  // Find the matching closing bracket
  let depth = 0;
  let arrayEnd = arrayStart;
  for (let i = arrayStart; i < content.length; i++) {
    if (content[i] === "[") depth++;
    if (content[i] === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }

  return { arrayStart, arrayEnd };
}

/**
 * Update a TOML array in a specific section by filtering out excluded entries
 * and appending new ones.
 *
 * Preserves comments and indentation of non-excluded entries.
 */
function updateTomlArray(content: string, sectionHeader: string, key: string, newEntries: string[]): string {
  const info = findTomlArray(content, sectionHeader, key);
  if (!info) return content;

  // Parse the array content line by line to preserve formatting
  const arrayContent = content.slice(info.arrayStart + 1, info.arrayEnd - 1);
  const lines = arrayContent.split("\n");

  // Keep lines that are comments, blank, or contain non-excluded entries
  const keptLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Keep blank lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      keptLines.push(line);
      continue;
    }
    // Check if this line contains a string entry that should be excluded
    const stringMatch = /"((?:[^"\\]|\\.)*)"/.exec(trimmed);
    if (stringMatch && isExcludedEntry(stringMatch[1])) {
      continue; // Remove this line
    }
    keptLines.push(line);
  }

  // Append new entries with trailing commas
  const newLines = newEntries.map((entry) => `${ARRAY_INDENT}"${entry}",`);

  // Reconstruct the array content
  // Remove trailing empty lines from kept lines before appending
  while (keptLines.length > 0 && keptLines[keptLines.length - 1].trim() === "") {
    keptLines.pop();
  }

  const reconstructed = [...keptLines, ...newLines, ""].join("\n");

  return content.slice(0, info.arrayStart + 1) + reconstructed + content.slice(info.arrayEnd - 1);
}

/**
 * Python language adapter for apply-exclude.
 *
 * Updates pyproject.toml to exclude specified nodes from pytest, mypy,
 * and pyright. Ruff is never excluded — style is checked regardless of
 * implementation existence.
 */
export const pythonAdapter: LanguageAdapter = {
  language: "Python",
  configFile: PYTHON_CONFIG_FILE,
  tools: ["pytest", "mypy", "pyright"],
  excluded: ["ruff (style checked regardless of implementation existence)"],

  applyExclusions(content: string, nodes: string[]): ApplyResult {
    let result = content;

    // 1. Update pytest addopts
    result = updatePytestAddopts(result, nodes);

    // 2. Update mypy exclude
    const mypyEntries = nodes.map(toMypyRegex);
    result = updateTomlArray(result, MYPY_SECTION, "exclude", mypyEntries);

    // 3. Update pyright exclude
    const pyrightEntries = nodes.map(toPyrightPath);
    result = updateTomlArray(result, PYRIGHT_SECTION, "exclude", pyrightEntries);

    return {
      changed: result !== content,
      content: result,
    };
  },
};
