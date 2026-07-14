import {
  assertContextRoutesThroughDevelopmentCli,
  assertLocalStatusFormatFlagsRemainHermetic,
  assertNextRoutesThroughDevelopmentCli,
  assertStatusRoutesThroughDevelopmentCli,
  assertStatusUpdateRoutesThroughDevelopmentCli,
  assertUnsupportedStatusFormatIsRejected,
} from "@testing/harnesses/spec-tree/spec-cli-contract";
import { describe, it } from "vitest";

describe("spx spec process contract", () => {
  it("routes status through the development CLI entry point", async () => {
    await assertStatusRoutesThroughDevelopmentCli();
  });

  it("accepts the status --update flag through the development CLI entry point", async () => {
    await assertStatusUpdateRoutesThroughDevelopmentCli();
  });

  it("routes next through the development CLI entry point", async () => {
    await assertNextRoutesThroughDevelopmentCli();
  });

  it("routes context through the development CLI entry point", async () => {
    await assertContextRoutesThroughDevelopmentCli();
  });

  it("rejects an unsupported status output format", async () => {
    await assertUnsupportedStatusFormatIsRejected();
  });

  it("accepts local status format flags without network or shared state", async () => {
    await assertLocalStatusFormatFlagsRemainHermetic();
  });
});
