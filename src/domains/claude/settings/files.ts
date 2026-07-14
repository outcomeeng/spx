export const CLAUDE_SETTINGS_PATH = {
  DIRECTORY: ".claude",
  LOCAL_FILE: "settings.local.json",
  GLOBAL_FILE: "settings.json",
  BACKUP_MARKER: ".backup.",
  DEFAULT_SCAN_DIRECTORY: "Code",
} as const;

export const CLAUDE_LOCAL_SETTINGS_GLOB = `**/${CLAUDE_SETTINGS_PATH.DIRECTORY}/${CLAUDE_SETTINGS_PATH.LOCAL_FILE}`;
