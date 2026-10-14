import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { consents, personas, type MemoraDb } from "@memora/db";
import { and, eq, isNull } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { DB } from "../db/db.tokens";

/**
 * Blocks outbound LLM calls unless the persona has active send_to_provider
 * consent for the requested provider (docs/06, docs/12).
 */
@Injectable()
export class ProviderConsentService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async assertCanCallProvider(
    personaId: string,
    provider: string,
  ): Promise<void> {
    const persona = await this.db.query.personas.findFirst({
      where: and(eq(personas.id, personaId), isNull(personas.deletedAt)),
    });
    if (!persona) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "PERSONA_NOT_FOUND",
        "Persona not found.",
      );
    }

    const active = await this.db.query.consents.findMany({
      where: and(
        eq(consents.personaId, personaId),
        eq(consents.purpose, "send_to_provider"),
        isNull(consents.revokedAt),
      ),
    });

    const ok = active.some((c) => {
      if (c.providerKey === provider) return true;
      // Wizard may store provider on the persona and leave consent.providerKey null.
      if (c.providerKey == null && persona.providerKey === provider) return true;
      return false;
    });

    if (!ok) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "CONSENT_REQUIRED",
        "send_to_provider consent is required before calling an LLM provider.",
        { purpose: "send_to_provider", provider },
      );
    }
  }
}
