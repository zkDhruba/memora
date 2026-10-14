import { describe, expect, it } from "vitest";
import {
  expandRetrievalQuery,
  isSoftIdentityQuery,
} from "./soft-identity-query";

describe("soft identity query", () => {
  it("detects remember-me style questions", () => {
    expect(isSoftIdentityQuery("Do you remember me?")).toBe(true);
    expect(isSoftIdentityQuery("who are you")).toBe(true);
    expect(isSoftIdentityQuery("What did you say about Kyoto?")).toBe(false);
  });

  it("expands soft queries with biography", () => {
    const q = expandRetrievalQuery(
      "Do you remember me?",
      "Grew up in Dhaka. Dry humor.",
      "Ajin",
    );
    expect(q).toContain("Do you remember me?");
    expect(q).toContain("Ajin");
    expect(q).toContain("Dhaka");
  });
});
