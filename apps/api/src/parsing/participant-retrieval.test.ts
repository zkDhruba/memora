import { describe, expect, it } from "vitest";
import { defaultRetrievalAllowed } from "./participant-retrieval";

describe("defaultRetrievalAllowed (2.7 / GOV-2)", () => {
  it("allows only subject by default", () => {
    expect(defaultRetrievalAllowed("subject")).toBe(true);
    expect(defaultRetrievalAllowed("other")).toBe(false);
    expect(defaultRetrievalAllowed("unknown")).toBe(false);
  });
});
