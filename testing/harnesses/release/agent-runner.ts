import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AgentRunner, AgentRunRequest } from "@/agent/agent-runner";

/**
 * A recording + writing AgentRunner double for release-notes composition tests.
 *
 * The production agent is a network- and credential-bound, non-deterministic
 * dependency (the Claude Agent SDK), so the composition's path resolution, prompt
 * assembly, and read-back validation are exercised at l1 by injecting this double
 * for the agent alone. It records every request so a test can inspect the prompt
 * the composition assembled (Stage 5 observability), and it writes a predetermined
 * changelog body to a fixed output path, modelling the artifact the real agent
 * would write so the composition's injected reader performs a real filesystem
 * read-back rather than reading from a double.
 */
export class RecordingWritingAgentRunner implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(
    private readonly outputPath: string,
    private readonly changelogContent: string,
  ) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, this.changelogContent);
  }

  /** The prompt of the most recent request, for inspecting what the composition assembled. */
  get lastPrompt(): string {
    const last = this.requests.at(-1);
    if (last === undefined) {
      throw new Error("Agent runner double received no request");
    }
    return last.prompt;
  }
}
