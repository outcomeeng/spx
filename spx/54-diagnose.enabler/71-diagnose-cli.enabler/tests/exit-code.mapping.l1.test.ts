import { describe, it } from "vitest";

import { assertExitCodeCase, DIAGNOSE_EXIT_CODE_CASES } from "@testing/harnesses/diagnose/cli";

describe("the process exit code maps the overall verdict", () => {
  it.each(DIAGNOSE_EXIT_CODE_CASES)("maps $overall to $expectedCode", assertExitCodeCase);
});
