import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { ProviderConsentService } from "./provider-consent.service";

function makeDb(opts: {
  persona?: { id: string; providerKey: string | null; deletedAt: Date | null } | null;
  consents?: Array<{ providerKey: string | null }>;
}) {
  return {
    query: {
      personas: {
        findFirst: vi.fn(async () => opts.persona ?? null),
      },
      consents: {
        findMany: vi.fn(async () => opts.consents ?? []),
      },
    },
  };
}

describe("ProviderConsentService (3.1)", () => {
  it("refuses when send_to_provider consent is missing", async () => {
    const svc = new ProviderConsentService(
      makeDb({
        persona: {
          id: "p1",
          providerKey: "openrouter",
          deletedAt: null,
        },
        consents: [],
      }) as never,
    );
    try {
      await svc.assertCanCallProvider("p1", "openrouter");
      expect.fail("expected CONSENT_REQUIRED");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const body = (err as HttpException).getResponse() as {
        error?: { code?: string };
      };
      expect(body.error?.code).toBe("CONSENT_REQUIRED");
    }
  });

  it("allows when consent.providerKey matches", async () => {
    const svc = new ProviderConsentService(
      makeDb({
        persona: { id: "p1", providerKey: null, deletedAt: null },
        consents: [{ providerKey: "openrouter" }],
      }) as never,
    );
    await expect(
      svc.assertCanCallProvider("p1", "openrouter"),
    ).resolves.toBeUndefined();
  });

  it("allows null consent key when persona.providerKey matches", async () => {
    const svc = new ProviderConsentService(
      makeDb({
        persona: {
          id: "p1",
          providerKey: "openrouter",
          deletedAt: null,
        },
        consents: [{ providerKey: null }],
      }) as never,
    );
    await expect(
      svc.assertCanCallProvider("p1", "openrouter"),
    ).resolves.toBeUndefined();
  });

  it("refuses wrong provider even with other consent", async () => {
    const svc = new ProviderConsentService(
      makeDb({
        persona: { id: "p1", providerKey: "anthropic", deletedAt: null },
        consents: [{ providerKey: "anthropic" }],
      }) as never,
    );
    await expect(svc.assertCanCallProvider("p1", "openrouter")).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
