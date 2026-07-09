const SHELL_COMMAND_SEPARATOR = {
  SEQUENCE: ";",
} as const;

const SHELL_OPERATOR_AND = "&&";
const SHELL_OPERATOR_OR = "||";
const SHELL_OPERATOR_AMPERSAND = "&";
const SHELL_OPERATOR_PIPE = "|";
const SHELL_BOURNE_COMMAND = "sh";
const SHELL_BASH_COMMAND = "bash";
const SHELL_COMMAND_STRING_FLAG = "-c";
const SHELL_LOGIN_COMMAND_STRING_FLAG = "-lc";
const SHELL_REDIRECTION_PATTERN = /^\d*(?:>>?|<<<?|>&|<&|&>|&>>)$/u;
const SHELL_DUPLICATED_DESCRIPTOR_PATTERN = /^\d*(?:>>?|<<<?|>&|<&|&>|&>>)&?\d+$/u;
const SHELL_WORD_PATTERN = /"([^"]*)"|'([^']*)'|(\d*(?:>>?|<<<?|>&|<&|&>|&>>)&?\d*)|(&&|\|\||[;&|])|([^\s;&|<>]+)/gu;

export function shellWords(command: string): readonly string[] {
  return [...command.matchAll(SHELL_WORD_PATTERN)].map((match) =>
    match.at(1) ?? match.at(2) ?? match.at(3) ?? match.at(4) ?? match[0]
  );
}

export function shellSuccessProvingCommandSegments(words: readonly string[]): readonly (readonly string[])[] {
  const segments: string[][] = [[]];
  for (const word of words) {
    if (isShellUnsafeSuccessSeparator(word)) {
      return [];
    }
    if (word === SHELL_OPERATOR_AND) {
      segments.push([]);
      continue;
    }
    segments[segments.length - 1].push(word);
  }
  const populatedSegments = segments.filter((segment) => segment.length > 0);
  const reachableSegments: string[][] = [];
  for (const segment of populatedSegments) {
    reachableSegments.push(segment);
    if (isShellKnownFailingSegment(segment)) {
      break;
    }
  }
  return reachableSegments;
}

export function stripShellRedirections(words: readonly string[]): readonly string[] {
  const command: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (SHELL_DUPLICATED_DESCRIPTOR_PATTERN.test(word)) {
      continue;
    }
    if (SHELL_REDIRECTION_PATTERN.test(word)) {
      index += 1;
      continue;
    }
    command.push(word);
  }
  return command;
}

export function shellCommandWrapperWords(words: readonly string[]): readonly string[] | null {
  const executable = words[0];
  if (executable !== SHELL_BOURNE_COMMAND && executable !== SHELL_BASH_COMMAND) {
    return null;
  }
  const commandIndex = words.findIndex((word) =>
    word === SHELL_COMMAND_STRING_FLAG || word === SHELL_LOGIN_COMMAND_STRING_FLAG
  );
  const command = commandIndex === -1 ? undefined : words.at(commandIndex + 1);
  return command === undefined ? null : shellWords(command);
}

function isShellKnownFailingSegment(words: readonly string[]): boolean {
  return stripShellRedirections(words)[0] === "false";
}

function isShellUnsafeSuccessSeparator(word: string): boolean {
  return word === SHELL_OPERATOR_OR
    || word === SHELL_OPERATOR_AMPERSAND
    || word === SHELL_OPERATOR_PIPE
    || word === SHELL_COMMAND_SEPARATOR.SEQUENCE;
}
