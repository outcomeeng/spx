import { describe, it } from "vitest";

import {
  assertSpecApplyCliRejectsConfigurationWrites,
  assertSpecContextCliRendersTarget,
  assertSpecNextCliRendersSelection,
  assertSpecStatusCliAcceptsLocalJsonFormat,
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

  it("rejects an unsupported status output format", async () => {
    await assertSpecStatusCliRejectsUnsupportedFormat();
  });

  it("accepts local status format flags without network or shared state", async () => {
    await assertSpecStatusCliAcceptsLocalJsonFormat();
  });

  it("rejects config-writing apply routing without modifying product configuration", async () => {
    await assertSpecApplyCliRejectsConfigurationWrites();
  });
});
