import { AGENT_TRANSCRIPT_GIT_COMMAND } from "../protocol";
import { shellCommandWrapperWords, shellSuccessProvingCommandSegments, stripShellRedirections } from "./shell-command";

export function gitCommandAssociatesBranch(words: readonly string[], branch: string): boolean {
  const segments = shellSuccessProvingCommandSegments(words);
  let contextStable = true;
  for (const segment of segments) {
    if (isContextChangingShellSegment(segment)) {
      contextStable = false;
      continue;
    }
    if (contextStable && shellSegmentAssociatesBranch(segment, branch)) {
      return true;
    }
  }
  return false;
}

function shellSegmentAssociatesBranch(words: readonly string[], branch: string): boolean {
  const gitCommands = normalizeGitCommandSegments(words);
  return gitCommands.some((gitCommand) => {
    const args = stripGitGlobalOptions(gitCommand);
    return args !== null && (
      gitSwitchCommandAssociatesBranch(args, branch)
      || gitCheckoutCommandAssociatesBranch(args, branch)
      || gitWorktreeAddCommandAssociatesBranch(args, branch)
    );
  });
}

function stripGitGlobalOptions(words: readonly string[]): readonly string[] | null {
  if (words[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE) {
    return null;
  }
  let index = 1;
  while (index < words.length) {
    const optionConsumption = gitOptionConsumption(words, index, GIT_GLOBAL_OPTIONS);
    if (optionConsumption === GIT_OPTION_CONSUMPTION.INVALID) {
      return null;
    }
    if (optionConsumption === GIT_OPTION_CONSUMPTION.NOT_ALLOWED) {
      break;
    }
    index += optionConsumption + 1;
  }
  return words.slice(index);
}

function gitSwitchCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(1), SWITCH_CREATE_FLAGS, SWITCH_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length <= 1;
  }
  return parsed.positionals.length === 1 && positionalBranchMatches(parsed.positionals[0], parsed, branch);
}

function gitCheckoutCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(1), CHECKOUT_CREATE_FLAGS, CHECKOUT_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length <= 1;
  }
  return parsed.positionals.length === 1 && positionalBranchMatches(parsed.positionals[0], parsed, branch);
}

function gitWorktreeAddCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (
    args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE
    || args[1] !== AGENT_TRANSCRIPT_GIT_COMMAND.ADD
  ) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(2), WORKTREE_CREATE_FLAGS, WORKTREE_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length >= 1 && parsed.positionals.length <= 2;
  }
  if (parsed.positionals.length === 2) {
    return parsed.positionals[1] === branch;
  }
  return false;
}

interface ParsedGitBranchArgs {
  readonly createdBranch: string | null;
  readonly positionals: readonly string[];
  readonly usesTrack: boolean;
  readonly invalid: boolean;
}

interface GitAllowedOptions {
  readonly flags: readonly string[];
  readonly valueFlags: readonly string[];
  readonly optionalValueFlags: readonly string[];
}

const GIT_OPTION_CONSUMPTION = {
  INVALID: "invalid",
  NOT_ALLOWED: "not-allowed",
} as const;

type GitOptionConsumption = number | (typeof GIT_OPTION_CONSUMPTION)[keyof typeof GIT_OPTION_CONSUMPTION];

interface GitCreateBranchParse {
  readonly branch: string;
  readonly consumed: number;
}

const SWITCH_CREATE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG,
  AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN,
] as const;

const CHECKOUT_CREATE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN,
] as const;

const WORKTREE_CREATE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT,
] as const;

const CHECKOUT_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_INHERIT,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERLAY,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERLAY,
  AGENT_TRANSCRIPT_GIT_COMMAND.PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_REFLOG_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RECURSE_SUBMODULES,
] as const;

const CHECKOUT_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: CHECKOUT_ALLOWED_FLAGS,
  valueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT],
  optionalValueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES],
};

const SWITCH_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_INHERIT,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.DISCARD_CHANGES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_DISCARD_CHANGES,
  AGENT_TRANSCRIPT_GIT_COMMAND.PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RECURSE_SUBMODULES,
] as const;

const SWITCH_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: SWITCH_ALLOWED_FLAGS,
  valueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT],
  optionalValueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES],
};

const WORKTREE_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT_WORKTREE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_CHECKOUT_WORKTREE,
  AGENT_TRANSCRIPT_GIT_COMMAND.LOCK,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_LOCK,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS_REMOTE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS_REMOTE,
  AGENT_TRANSCRIPT_GIT_COMMAND.RELATIVE_PATHS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RELATIVE_PATHS,
] as const;

const WORKTREE_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: WORKTREE_ALLOWED_FLAGS,
  valueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.REASON],
  optionalValueFlags: [],
};

const GIT_GLOBAL_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.HTML_PATH,
  AGENT_TRANSCRIPT_GIT_COMMAND.MAN_PATH,
  AGENT_TRANSCRIPT_GIT_COMMAND.INFO_PATH,
  AGENT_TRANSCRIPT_GIT_COMMAND.PAGINATE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.PAGINATE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_PAGER,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_REPLACE_OBJECTS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_LAZY_FETCH,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OPTIONAL_LOCKS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_ADVICE,
  AGENT_TRANSCRIPT_GIT_COMMAND.BARE,
] as const;

const GIT_GLOBAL_OPTIONS: GitAllowedOptions = {
  flags: GIT_GLOBAL_FLAGS,
  valueFlags: [
    AGENT_TRANSCRIPT_GIT_COMMAND.CONFIG,
    AGENT_TRANSCRIPT_GIT_COMMAND.NAMESPACE,
    AGENT_TRANSCRIPT_GIT_COMMAND.CONFIG_ENV,
  ],
  optionalValueFlags: [AGENT_TRANSCRIPT_GIT_COMMAND.EXEC_PATH],
};

const DISALLOWED_BRANCH_ASSOCIATION_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.DETACH,
  AGENT_TRANSCRIPT_GIT_COMMAND.PATHSPEC_SEPARATOR,
] as const;

const SHELL_ENV_COMMAND = "env";
const SHELL_COMMAND_WRAPPER_COMMAND = "command";
const SHELL_SUDO_COMMAND = "sudo";
const SHELL_CHANGE_DIRECTORY_COMMAND = "cd";
const SHELL_ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*$/u;
const CONTEXT_CHANGING_GIT_ENV = new Set(["GIT_DIR", "GIT_WORK_TREE"]);

function isContextChangingShellSegment(words: readonly string[]): boolean {
  const command = stripShellRedirections(words);
  return command[0] === SHELL_CHANGE_DIRECTORY_COMMAND;
}

function normalizeGitCommandSegments(words: readonly string[]): readonly (readonly string[])[] {
  let index = 0;
  while (index < words.length) {
    if (words[index] === SHELL_ENV_COMMAND) {
      index += 1;
      continue;
    }
    if (SHELL_ENV_ASSIGNMENT_PATTERN.test(words[index])) {
      if (isShellContextChangingEnvAssignment(words[index])) {
        return [];
      }
      index += 1;
      continue;
    }
    break;
  }
  if (words[index] === SHELL_COMMAND_WRAPPER_COMMAND || words[index] === SHELL_SUDO_COMMAND) {
    return normalizeGitCommandSegments(words.slice(index + 1));
  }
  const shellCommandWords = shellCommandWrapperWords(words.slice(index));
  if (shellCommandWords !== null) {
    return scopedGitCommandSegments(shellCommandWords);
  }
  const command = stripShellRedirections(words.slice(index));
  return command[0] === AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE ? [command] : [];
}

function scopedGitCommandSegments(words: readonly string[]): readonly (readonly string[])[] {
  const commands: (readonly string[])[] = [];
  let contextStable = true;
  for (const segment of shellSuccessProvingCommandSegments(words)) {
    if (isContextChangingShellSegment(segment)) {
      contextStable = false;
      continue;
    }
    if (contextStable) {
      commands.push(...normalizeGitCommandSegments(segment));
    }
  }
  return commands;
}

function isShellContextChangingEnvAssignment(word: string): boolean {
  const variableName = word.slice(0, word.indexOf("="));
  return CONTEXT_CHANGING_GIT_ENV.has(variableName);
}

function parseGitBranchArgs(
  args: readonly string[],
  createFlags: readonly string[],
  allowedOptions: GitAllowedOptions,
): ParsedGitBranchArgs {
  const positionals: string[] = [];
  let createdBranch: string | null = null;
  let usesTrack = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (tupleIncludes(DISALLOWED_BRANCH_ASSOCIATION_FLAGS, arg)) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    const createBranch = gitCreateBranchParse(args, index, createFlags);
    if (createBranch === GIT_OPTION_CONSUMPTION.INVALID) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    if (createBranch !== null) {
      createdBranch = createBranch.branch;
      index += createBranch.consumed;
      continue;
    }
    const optionConsumption = gitOptionConsumption(args, index, allowedOptions);
    if (optionConsumption === GIT_OPTION_CONSUMPTION.INVALID) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    if (optionConsumption !== GIT_OPTION_CONSUMPTION.NOT_ALLOWED) {
      usesTrack ||= isTrackOption(arg);
      index += optionConsumption;
      continue;
    }
    if (arg.startsWith("-")) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    positionals.push(arg);
  }
  return { createdBranch, positionals, usesTrack, invalid: false };
}

function positionalBranchMatches(positional: string, parsed: ParsedGitBranchArgs, branch: string): boolean {
  return positional === branch || parsed.usesTrack && remoteTrackingBranchLocalName(positional) === branch;
}

function remoteTrackingBranchLocalName(ref: string): string | null {
  const firstSlash = ref.indexOf("/");
  return firstSlash > 0 && firstSlash < ref.length - 1 ? ref.slice(firstSlash + 1) : null;
}

function gitCreateBranchParse(
  args: readonly string[],
  index: number,
  createFlags: readonly string[],
): GitCreateBranchParse | typeof GIT_OPTION_CONSUMPTION.INVALID | null {
  const arg = args[index];
  for (const flag of createFlags) {
    if (arg === flag) {
      const branch = args.at(index + 1);
      return parseCreatedBranch(branch, 1);
    }
    if (isInlineValueFlag([flag], arg)) {
      return parseCreatedBranch(arg.slice(flag.length + 1), 0);
    }
    if (isShortFlagWithAttachedValue(flag, arg)) {
      return parseCreatedBranch(arg.slice(flag.length), 0);
    }
  }
  return null;
}

function parseCreatedBranch(
  branch: string | undefined,
  consumed: number,
): GitCreateBranchParse | typeof GIT_OPTION_CONSUMPTION.INVALID {
  if (branch === undefined || branch.length === 0 || branch.startsWith("-")) {
    return GIT_OPTION_CONSUMPTION.INVALID;
  }
  return {
    branch,
    consumed,
  };
}

function isShortFlagWithAttachedValue(flag: string, arg: string): boolean {
  return flag.length === 2 && arg.startsWith(flag) && arg.length > flag.length;
}

function gitOptionConsumption(
  args: readonly string[],
  index: number,
  allowedOptions: GitAllowedOptions,
): GitOptionConsumption {
  const arg = args[index];
  if (isInlineValueFlag(allowedOptions.valueFlags, arg)) {
    return 0;
  }
  if (tupleIncludes(allowedOptions.valueFlags, arg)) {
    const value = args.at(index + 1);
    if (value === undefined || value.startsWith("-")) {
      return GIT_OPTION_CONSUMPTION.INVALID;
    }
    return 1;
  }
  if (isInlineValueFlag(allowedOptions.optionalValueFlags, arg) || tupleIncludes(allowedOptions.flags, arg)) {
    return 0;
  }
  if (tupleIncludes(allowedOptions.optionalValueFlags, arg)) {
    return 0;
  }
  return GIT_OPTION_CONSUMPTION.NOT_ALLOWED;
}

function tupleIncludes(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function isInlineValueFlag(flags: readonly string[], value: string): boolean {
  return flags.some((flag) => value.startsWith(`${flag}=`) && value.length > flag.length + 1);
}

function isTrackOption(value: string): boolean {
  return value === AGENT_TRANSCRIPT_GIT_COMMAND.TRACK
    || value === AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT
    || value.startsWith(`${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK}=`);
}
