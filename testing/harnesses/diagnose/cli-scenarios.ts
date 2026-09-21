import type { DiagnoseCliScenario } from "@testing/generators/diagnose/cli-scenarios";
import { type DiagnoseCliEnvironment, withDiagnoseCli } from "./cli";

/** Materializes scenario input and delegates resource lifecycle to the shared diagnose harness. */
export async function withDiagnoseCliScenario<T>(
  scenario: DiagnoseCliScenario,
  callback: (env: DiagnoseCliEnvironment, scenario: DiagnoseCliScenario) => Promise<T>,
): Promise<T> {
  return withDiagnoseCli(async (env) => {
    await env.writeConfig(scenario.config);
    return callback(env, scenario);
  });
}
