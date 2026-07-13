/**
 * Parser for Claude Code settings files and permissions
 */
import fs from "node:fs/promises";
import {
  type ClaudeSettings,
  type Permission,
  PERMISSION_CATEGORY,
  type PermissionCategory,
  type Permissions,
  SETTINGS_FILE_PARSE_STATUS,
  type SettingsFileParseError,
  type SettingsFileParseResult,
} from "./types";

const PERMISSION_PATTERN = /^([^(]+)\((.+)\)$/;
const PERMISSION_CATEGORIES: readonly PermissionCategory[] = Object.values(PERMISSION_CATEGORY);
const SETTINGS_OBJECT_ERROR = "Settings file must contain a JSON object";

export function formatPermission(type: string, scope: string): string {
  return `${type}(${scope})`;
}
/**
 * Parse a settings.json file and extract typed permissions.
 *
 * @param filePath - Absolute path to settings.json file
 * @returns A success result with parsed settings and permissions, or an error result with the input path and diagnostic
 *
 * @example
 * ```typescript
 * const result = await parseSettingsFile("/path/to/.claude/settings.json");
 * console.log(result.status);
 * ```
 */
export async function parseSettingsFile(filePath: string): Promise<SettingsFileParseResult> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(content);
    if (!isClaudeSettings(parsed)) {
      return settingsFileParseError(filePath, SETTINGS_OBJECT_ERROR);
    }

    return {
      status: SETTINGS_FILE_PARSE_STATUS.SUCCESS,
      filePath,
      settings: parsed,
      permissions: parseAllPermissions(parsed.permissions ?? {}),
    };
  } catch (error) {
    return settingsFileParseError(filePath, errorMessage(error));
  }
}

function isClaudeSettings(value: unknown): value is ClaudeSettings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function settingsFileParseError(filePath: string, error: string): SettingsFileParseError {
  return {
    status: SETTINGS_FILE_PARSE_STATUS.ERROR,
    filePath,
    error,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse a permission string into structured components
 *
 * Permission format: "Type(scope)"
 * Examples:
 * - "Bash(git:*)" => { type: "Bash", scope: "git:*" }
 * - "Read(file_path:/Users/user/Code/**)" => { type: "Read", scope: "file_path:/Users/user/Code/**" }
 * - "WebFetch(domain:github.com)" => { type: "WebFetch", scope: "domain:github.com" }
 *
 * @param raw - Raw permission string
 * @param category - Permission category (allow/deny/ask)
 * @returns Parsed Permission object
 * @throws Error if permission string is malformed
 *
 * @example
 * ```typescript
 * const perm = parsePermission("Bash(git:*)", "allow");
 * // Returns: { raw: "Bash(git:*)", type: "Bash", scope: "git:*", category: "allow" }
 * ```
 */
export function parsePermission(raw: string, category: PermissionCategory): Permission {
  // Match pattern: Type(scope)
  const match = PERMISSION_PATTERN.exec(raw);

  if (!match) {
    throw new Error(`Malformed permission string: "${raw}"`);
  }

  const [, type, scope] = match;

  return {
    raw,
    type: type.trim(),
    scope: scope.trim(),
    category,
  };
}

/**
 * Parse all permissions from a Permissions object
 *
 * Converts permission strings to structured Permission objects,
 * grouped by category (allow/deny/ask).
 *
 * @param permissions - Permissions object from settings.json
 * @returns Array of parsed Permission objects
 *
 * @example
 * ```typescript
 * const permissions = {
 *   allow: ["Bash(git:*)", "Bash(npm:*)"],
 *   deny: ["Bash(rm -rf:*)"]
 * };
 * const parsed = parseAllPermissions(permissions);
 * // Returns array of Permission objects with category set
 * ```
 */
export function parseAllPermissions(permissions: Permissions): Permission[] {
  const result: Permission[] = [];
  for (const category of PERMISSION_CATEGORIES) {
    result.push(...parsePermissionsByCategory(permissions[category], category));
  }

  return result;
}

function parsePermissionsByCategory(
  rawPermissions: readonly string[] | undefined,
  category: PermissionCategory,
): Permission[] {
  if (rawPermissions === undefined) return [];

  const result: Permission[] = [];
  for (const raw of rawPermissions) {
    try {
      result.push(parsePermission(raw, category));
    } catch {
      continue;
    }
  }
  return result;
}

/**
 * Read and parse multiple settings files while preserving one ordered result per input path.
 *
 * @param filePaths - Array of absolute paths to settings files
 * @returns Ordered success or error results for every input path
 *
 * @example
 * ```typescript
 * const files = [
 *   "/Users/user/Code/project-a/.claude/settings.local.json",
 *   "/Users/user/Code/project-b/.claude/settings.local.json"
 * ];
 * const results = await parseAllSettings(files);
 * // Returns one success or error result per path.
 * ```
 */
export async function parseAllSettings(
  filePaths: readonly string[],
): Promise<SettingsFileParseResult[]> {
  return Promise.all(filePaths.map(parseSettingsFile));
}
