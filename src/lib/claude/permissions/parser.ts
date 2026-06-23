/**
 * Parser for Claude Code settings files and permissions
 */
import fs from "node:fs/promises";
import type { ClaudeSettings, Permission, PermissionCategory, Permissions } from "./types";

const PERMISSION_PATTERN = /^([^(]+)\((.+)\)$/;
const PERMISSION_CATEGORIES = ["allow", "deny", "ask"] as const satisfies readonly PermissionCategory[];

/**
 * Parse a settings.json file and extract permissions
 *
 * Handles:
 * - Malformed JSON (returns null)
 * - Missing permissions object (returns empty permissions)
 * - Validates basic structure
 *
 * @param filePath - Absolute path to settings.json file
 * @returns Promise resolving to ClaudeSettings object, or null if malformed
 *
 * @example
 * ```typescript
 * const settings = await parseSettingsFile("/path/to/.claude/settings.json");
 * if (settings) {
 *   console.log(settings.permissions?.allow);
 * }
 * ```
 */
export async function parseSettingsFile(filePath: string): Promise<ClaudeSettings | null> {
  try {
    // Read file contents
    const content = await fs.readFile(filePath, "utf-8");

    // Parse JSON
    const parsed = JSON.parse(content);

    // Basic validation: should be an object
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    return parsed as ClaudeSettings;
  } catch {
    // JSON parse error or file read error
    return null;
  }
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
 * Read and parse multiple settings files
 *
 * Processes an array of file paths, reading and parsing each one.
 * Skips files that can't be read or parsed.
 *
 * @param filePaths - Array of absolute paths to settings files
 * @returns Promise resolving to array of Permissions objects (one per valid file)
 *
 * @example
 * ```typescript
 * const files = [
 *   "/Users/user/Code/project-a/.claude/settings.local.json",
 *   "/Users/user/Code/project-b/.claude/settings.local.json"
 * ];
 * const allPermissions = await parseAllSettings(files);
 * // Returns: [{ allow: [...], deny: [...] }, { allow: [...] }]
 * ```
 */
export async function parseAllSettings(filePaths: string[]): Promise<Permissions[]> {
  const results: Permissions[] = [];

  for (const filePath of filePaths) {
    const settings = await parseSettingsFile(filePath);
    if (settings?.permissions) {
      results.push(settings.permissions);
    }
  }

  return results;
}
