import type { AgentRunner } from "@/agent/agent-runner";

export interface DocumentationSyncCommandOptions {
  readonly productDir: string;
  readonly agentRunner: AgentRunner;
}

export async function documentationSyncCommand(
  _options: DocumentationSyncCommandOptions,
): Promise<readonly string[]> {
  throw new Error("documentation sync command is not implemented");
}
