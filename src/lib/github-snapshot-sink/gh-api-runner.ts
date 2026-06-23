import { execa } from "execa";

import type { GithubApiRunner } from "./pull-request-comment-client";

export const GH_API = {
  executable: "gh",
} as const;

/** Runs the real GitHub CLI for GitHub API calls made by snapshot adapter clients. */
export const runGhApi: GithubApiRunner = async (args, options) => {
  const result = await execa(GH_API.executable, [...args], {
    ...(options?.input === undefined ? {} : { input: options.input }),
  });
  return { stdout: typeof result.stdout === "string" ? result.stdout : "" };
};
