import { isDeepStrictEqual } from "node:util";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import { validateCommand } from "@/commands/config/validate";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { configCliDefaults, configCliDeps } from "@testing/harnesses/config/cli";

const initialCwd = process.cwd();
const initialEnvironment = { ...process.env };
const successfulDeps = configCliDeps({ ok: true, value: configCliDefaults() });
const rejectedDeps = configCliDeps({
  ok: false,
  error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
});

await showCommand({}, successfulDeps);
await showCommand({ json: true }, successfulDeps);
await showCommand({}, rejectedDeps);
await validateCommand({}, successfulDeps);
await validateCommand({}, rejectedDeps);
await defaultsCommand({}, successfulDeps);
await defaultsCommand({ json: true }, successfulDeps);

if (process.cwd() !== initialCwd) {
  throw new Error("config handler changed the process working directory");
}
if (!isDeepStrictEqual({ ...process.env }, initialEnvironment)) {
  throw new Error("config handler mutated the process environment");
}

console.log("CONFIG_EFFECT_SENTINEL_OK");
