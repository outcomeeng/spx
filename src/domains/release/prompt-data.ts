export const RELEASE_PROMPT_JSON_INDENT = 2;

const JSON_PROMPT_ESCAPE_PATTERN = /[<>&`]/gu;
const JSON_PROMPT_ESCAPES: Readonly<Record<string, string>> = {
  "&": String.raw`\u0026`,
  "<": String.raw`\u003c`,
  ">": String.raw`\u003e`,
  "`": String.raw`\u0060`,
};

export function encodeReleasePromptData(data: unknown): string {
  return JSON.stringify(data, null, RELEASE_PROMPT_JSON_INDENT).replace(
    JSON_PROMPT_ESCAPE_PATTERN,
    (character) => JSON_PROMPT_ESCAPES[character] ?? character,
  );
}
