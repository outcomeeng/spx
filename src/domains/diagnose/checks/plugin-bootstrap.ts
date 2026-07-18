import { AGENT, type HarnessEnvironmentConfig } from "@/domains/agent-environment/config";
import {
  classifyPluginBootstrapDeclarations,
  PLUGIN_BOOTSTRAP_DECLARATION_VERDICT,
  type PluginBootstrapDeclarationStatus,
  type PluginBootstrapDeclarationVerdict,
} from "@/domains/agent-environment/plugin-bootstrap-status";
import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

export const PLUGIN_BOOTSTRAP_REMEDIATION: Readonly<Record<PluginBootstrapDeclarationVerdict, string>> = {
  [PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY]:
    "Required marketplace and spec-tree declarations are present; no action needed.",
  [PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.BASELINE_MISSING]:
    "Declare the outcomeeng marketplace and spec-tree plugin for every enabled agent.",
};

const EMPTY_READING = "none";

function joined(values: readonly string[]): string {
  return values.length === 0 ? EMPTY_READING : values.join(",");
}

function expectationPlugins(status: PluginBootstrapDeclarationStatus, agent: keyof typeof AGENT): readonly string[] {
  const agentId = AGENT[agent];
  return status.expectations.find((expectation) => expectation.agent === agentId)?.plugins ?? [];
}

export function classifyPluginBootstrap(config: HarnessEnvironmentConfig): CheckRecord {
  const status = classifyPluginBootstrapDeclarations(config);
  return {
    name: CHECK_NAME.PLUGIN_BOOTSTRAP,
    verdict: status.verdict,
    bucket: status.verdict === PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY
      ? VERDICT_BUCKET.HEALTHY
      : VERDICT_BUCKET.BROKEN,
    readings: {
      missingBaseline: joined(status.missingBaseline),
      claudePlugins: joined(expectationPlugins(status, "CLAUDE_CODE")),
      codexPlugins: joined(expectationPlugins(status, "CODEX")),
      claudeOnly: joined(status.claudeOnly),
      codexOnly: joined(status.codexOnly),
    },
    remediation: PLUGIN_BOOTSTRAP_REMEDIATION[status.verdict],
  };
}

export function pluginBootstrapRunner(): CheckRunner {
  return async (facts) => classifyPluginBootstrap(facts.harnessEnvironment);
}
