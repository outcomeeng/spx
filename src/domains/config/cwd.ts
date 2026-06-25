export const CONFIG_PROCESS_CWD = {
  read: (): string => process.cwd(),
} as const;
