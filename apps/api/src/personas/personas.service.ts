import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  authorizationAttestations,
  consents,
  personaMemberships,
  personas,
  type MemoraDb,
} from "@memora/db";
import type {
  ConsentGrantBody,
  CreatePersonaBody,
  UpdatePersonaBody,
} from "@memora/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";
import { PlanGuardService } from "../plans/plan-guard.service";
import { PersonaAccessService } from "./persona-access.service";

export type PersonaListItem = {
  id: string;
  displayName: string;
  scenario: "living" | "legacy";
  status: string;
  role: string;
  audience: string;
  chatEligible: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PersonasService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    private readonly planGuard: PlanGuardService,
    private readonly audit: AuditService,
    private readonly access: PersonaAccessService,
  ) {}

  async listForUser(
    userId: string,
    opts: { forChat?: boolean } = {},
  ): Promise<PersonaListItem[]> {
    const rows = await this.db
      .select({
        id: personas.id,
        displayName: personas.displayName,
        scenario: personas.scenario,
        status: personas.status,
        role: personaMemberships.role,
        audience: personaMemberships.audience,
        deletedAt: personas.deletedAt,
        createdAt: personas.createdAt,
        updatedAt: personas.updatedAt,
      })
      .from(personaMemberships)
      .innerJoin(personas, eq(personas.id, personaMemberships.personaId))
      .where(eq(personaMemberships.userId, userId))
      .orderBy(desc(personas.updatedAt));

    const personaIds = rows.map((r) => r.id);
    const converseOk = await this.activeConversePersonaIds(personaIds);

    let items = rows.map((r) => ({
      ...r,
      chatEligible: this.isChatEligible(r.status, r.deletedAt, converseOk.has(r.id)),
    }));

    if (opts.forChat) {
      items = items.filter(
        (p) =>
          !p.deletedAt &&
          p.status !== "suspended" &&
          p.status !== "deleting",
      );
    }

    return items;
  }

  async getOne(userId: string, personaId: string) {
    const { membership } = await this.access.requireMember(userId, personaId);
    const persona = await this.db.query.personas.findFirst({
      where: and(eq(personas.id, personaId), isNull(personas.deletedAt)),
      with: {
        attestations: true,
        consents: true,
      },
    });
    if (!persona) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "PERSONA_NOT_FOUND",
        "Persona not found.",
      );
    }

    const activeConsents = persona.consents.filter((c) => !c.revokedAt);
    const converseOk = activeConsents.some((c) => c.purpose === "converse");

    return {
      id: persona.id,
      scenario: persona.scenario,
      status: persona.status,
      displayName: persona.displayName,
      alternateNames: persona.alternateNames,
      languages: persona.languages,
      biography: persona.biography,
      providerKey: persona.providerKey,
      readiness: persona.readiness,
      role: membership.role,
      audience: membership.audience,
      chatEligible: this.isChatEligible(
        persona.status,
        persona.deletedAt,
        converseOk,
      ),
      attestation: persona.attestations[0]
        ? {
            id: persona.attestations[0].id,
            kind: persona.attestations[0].kind,
            statement: persona.attestations[0].statement,
            evidenceNote: persona.attestations[0].evidenceNote,
            status: persona.attestations[0].status,
          }
        : null,
      consents: activeConsents.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        providerKey: c.providerKey,
        statementVersion: c.statementVersion,
        grantedAt: c.grantedAt,
      })),
      createdAt: persona.createdAt,
      updatedAt: persona.updatedAt,
    };
  }

  async create(userId: string, emailVerified: boolean, body: CreatePersonaBody) {
    if (!emailVerified) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before creating a persona.",
      );
    }

    await this.planGuard.assertCanCreatePersona(userId);

    const personaId = newId();
    const membershipId = newId();
    const attestationId = newId();
    const now = new Date();

    const initialConsents = body.consents ?? [];
    const hasHost = initialConsents.some((c) => c.purpose === "host_records");
    const hasConverse = initialConsents.some((c) => c.purpose === "converse");
    const status = hasHost && hasConverse ? "collecting" : "draft";

    await this.db.transaction(async (tx) => {
      await tx.insert(personas).values({
        id: personaId,
        scenario: body.scenario,
        status,
        displayName: body.displayName.trim(),
        alternateNames: body.alternateNames ?? [],
        languages: body.languages,
        biography: body.biography?.trim() || null,
        providerKey: body.providerKey ?? null,
        createdByUserId: userId,
      });

      await tx.insert(personaMemberships).values({
        id: membershipId,
        personaId,
        userId,
        role: "owner",
        audience: "private",
      });

      await tx.insert(authorizationAttestations).values({
        id: attestationId,
        personaId,
        kind: body.attestation.kind,
        statement: body.attestation.statement.trim(),
        evidenceNote: body.attestation.evidenceNote?.trim() || null,
        status: "declared",
      });

      for (const grant of initialConsents) {
        await tx.insert(consents).values({
          id: newId(),
          personaId,
          userId,
          purpose: grant.purpose,
          providerKey: grant.providerKey ?? null,
          statementVersion: grant.statementVersion,
          grantedAt: now,
        });
      }
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "persona.create",
      targetType: "persona",
      targetId: personaId,
      metadata: { scenario: body.scenario, status },
    });

    return this.getOne(userId, personaId);
  }

  async update(userId: string, personaId: string, body: UpdatePersonaBody) {
    await this.access.requireOwnerOrManager(userId, personaId);

    await this.db
      .update(personas)
      .set({
        ...(body.displayName !== undefined
          ? { displayName: body.displayName.trim() }
          : {}),
        ...(body.alternateNames !== undefined
          ? { alternateNames: body.alternateNames }
          : {}),
        ...(body.languages !== undefined ? { languages: body.languages } : {}),
        ...(body.biography !== undefined
          ? { biography: body.biography?.trim() || null }
          : {}),
        ...(body.providerKey !== undefined
          ? { providerKey: body.providerKey }
          : {}),
      })
      .where(eq(personas.id, personaId));

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "persona.update",
      targetType: "persona",
      targetId: personaId,
    });

    return this.getOne(userId, personaId);
  }

  async softDelete(userId: string, personaId: string) {
    await this.access.requireOwner(userId, personaId);

    await this.db
      .update(personas)
      .set({ deletedAt: new Date(), status: "deleting" })
      .where(eq(personas.id, personaId));

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "persona.delete",
      targetType: "persona",
      targetId: personaId,
    });
  }

  async listConsents(userId: string, personaId: string) {
    await this.access.requireOwner(userId, personaId);
    const rows = await this.db.query.consents.findMany({
      where: and(eq(consents.personaId, personaId), isNull(consents.revokedAt)),
      orderBy: [desc(consents.grantedAt)],
    });
    return {
      data: rows.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        providerKey: c.providerKey,
        statementVersion: c.statementVersion,
        grantedAt: c.grantedAt,
      })),
    };
  }

  async grantConsent(
    userId: string,
    personaId: string,
    body: ConsentGrantBody,
  ) {
    await this.access.requireOwner(userId, personaId);

    // Revoke any existing active consent for same purpose+provider, then insert.
    await this.db
      .update(consents)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(consents.personaId, personaId),
          eq(consents.purpose, body.purpose),
          isNull(consents.revokedAt),
          body.providerKey
            ? eq(consents.providerKey, body.providerKey)
            : sql`${consents.providerKey} is null`,
        ),
      );

    const id = newId();
    await this.db.insert(consents).values({
      id,
      personaId,
      userId,
      purpose: body.purpose,
      providerKey: body.providerKey ?? null,
      statementVersion: body.statementVersion,
      grantedAt: new Date(),
    });

    await this.maybePromoteFromDraft(personaId);

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "consent.grant",
      targetType: "consent",
      targetId: id,
      metadata: { purpose: body.purpose },
    });

    return this.listConsents(userId, personaId);
  }

  async revokeConsent(
    userId: string,
    personaId: string,
    consentId: string,
  ) {
    await this.access.requireOwner(userId, personaId);
    const row = await this.db.query.consents.findFirst({
      where: and(
        eq(consents.id, consentId),
        eq(consents.personaId, personaId),
        isNull(consents.revokedAt),
      ),
    });
    if (!row) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "CONSENT_NOT_FOUND",
        "Consent not found.",
      );
    }

    await this.db
      .update(consents)
      .set({ revokedAt: new Date() })
      .where(eq(consents.id, consentId));

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "consent.revoke",
      targetType: "consent",
      targetId: consentId,
      metadata: { purpose: row.purpose },
    });
  }

  private async maybePromoteFromDraft(personaId: string) {
    const persona = await this.db.query.personas.findFirst({
      where: eq(personas.id, personaId),
    });
    if (!persona || persona.status !== "draft") return;

    const active = await this.db.query.consents.findMany({
      where: and(eq(consents.personaId, personaId), isNull(consents.revokedAt)),
    });
    const hasHost = active.some((c) => c.purpose === "host_records");
    const hasConverse = active.some((c) => c.purpose === "converse");
    if (hasHost && hasConverse) {
      await this.db
        .update(personas)
        .set({ status: "collecting" })
        .where(eq(personas.id, personaId));
    }
  }

  private async activeConversePersonaIds(
    personaIds: string[],
  ): Promise<Set<string>> {
    if (personaIds.length === 0) return new Set();
    const rows = await this.db
      .select({ personaId: consents.personaId })
      .from(consents)
      .where(
        and(
          inArray(consents.personaId, personaIds),
          eq(consents.purpose, "converse"),
          isNull(consents.revokedAt),
        ),
      );
    return new Set(rows.map((r) => r.personaId));
  }

  private isChatEligible(
    status: string,
    deletedAt: Date | null,
    hasConverseConsent: boolean,
  ): boolean {
    if (deletedAt) return false;
    if (status === "suspended" || status === "deleting") return false;
    return hasConverseConsent;
  }
}
