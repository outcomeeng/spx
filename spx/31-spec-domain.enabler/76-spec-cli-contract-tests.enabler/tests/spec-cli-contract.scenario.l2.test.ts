import { describe, it } from "vitest";

import {
  assertSpecApplyCliRejectsConfigurationWrites,
  assertSpecContextCliEmitsContent,
  assertSpecContextCliRejectsContentWithoutJson,
  assertSpecContextCliRendersTarget,
  assertSpecNextCliRendersSelection,
  assertSpecStatusCliRejectsUnsupportedFormat,
  assertSpecStatusCliRendersCurrentTree,
  assertSpecStatusCliUpdatesDeclaredNodes,
} from "@testing/harnesses/spec/context";

describe("spx spec process contract", () => {
  it("routes status through the packaged executable", async () => {
    await assertSpecStatusCliRendersCurrentTree();
  });

  it("accepts the status --update flag through the packaged executable", async () => {
    await assertSpecStatusCliUpdatesDeclaredNodes();
  });

  it("routes next through the packaged executable", async () => {
    await assertSpecNextCliRendersSelection();
  });

  it("routes context through the packaged executable", async () => {
    await assertSpecContextCliRendersTarget();
  });

  it("routes content-bearing context through the packaged executable", async () => {
    await assertSpecContextCliEmitsContent();
  });

  it("rejects a content request without the machine output flag", async () => {
    await assertSpecContextCliRejectsContentWithoutJson();
  });

  it("rejects an unsupported status output format", async () => {
    await assertSpecStatusCliRejectsUnsupportedFormat();
  });

  it("rejects config-writing apply routing without modifying product configuration", async () => {
    await assertSpecApplyCliRejectsConfigurationWrites();
  });
});
