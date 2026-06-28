export const CONFIG_FILE_FORMAT = {
  JSON: "json",
  YAML: "yaml",
  TOML: "toml",
} as const;

export type ConfigFileFormat = (typeof CONFIG_FILE_FORMAT)[keyof typeof CONFIG_FILE_FORMAT];

export const CONFIG_FILE_DEFINITIONS = {
  [CONFIG_FILE_FORMAT.JSON]: {
    format: CONFIG_FILE_FORMAT.JSON,
    filename: "spx.config.json",
  },
  [CONFIG_FILE_FORMAT.YAML]: {
    format: CONFIG_FILE_FORMAT.YAML,
    filename: "spx.config.yaml",
  },
  [CONFIG_FILE_FORMAT.TOML]: {
    format: CONFIG_FILE_FORMAT.TOML,
    filename: "spx.config.toml",
  },
} as const;

export const CONFIG_FILE_FORMAT_ORDER = [
  CONFIG_FILE_FORMAT.JSON,
  CONFIG_FILE_FORMAT.YAML,
  CONFIG_FILE_FORMAT.TOML,
] as const;

export const DEFAULT_CONFIG_FILE_FORMAT = CONFIG_FILE_FORMAT.YAML;

export const CONFIG_FILENAMES = {
  json: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.JSON].filename,
  yaml: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.YAML].filename,
  toml: CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.TOML].filename,
} as const;

export type ConfigFilename = (typeof CONFIG_FILENAMES)[keyof typeof CONFIG_FILENAMES];

export const DEFAULT_CONFIG_FILENAME = CONFIG_FILE_DEFINITIONS[DEFAULT_CONFIG_FILE_FORMAT].filename;
