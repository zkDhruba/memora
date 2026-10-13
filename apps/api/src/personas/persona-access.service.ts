import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  personaMemberships,
  personas,
  type MemoraDb,
} from "@memora/db";
import { and, eq, isNull } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { DB } from "../db/db.tokens";

export type MembershipRole =
  | "owner"
  | "manager"
  | "contributor"
  | "participant";

export type PersonaAccess = {
  persona: typeof personas.$inferSelect;
  membership: typeof personaMemberships.$inferSelect;
};

/**
 * Central membership checks for persona-scoped routes.
 *
 * - Strangers (no membership): always 404 PERSONA_NOT_FOUND (do not leak existence).
 * - Soft-deleted personas: 404 for normal reads/actions.
 * - Members lacking the required role: 403 PERSONA_FORBIDDEN
 *   (they already know the persona id).
 */
@Injectable()
export class PersonaAccessService {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async requireMember(
    userId: string,
    personaId: string,
  ): Promise<PersonaAccess> {
    const persona = await this.loadActivePersona(personaId);
    const membership = await this.loadMembership(userId, personaId);
    if (!membership) {
      throw this.notFound();
    }
    return { persona, membership };
  }

  async requireRoles(
    userId: string,
    personaId: string,
    roles: readonly MembershipRole[],
  ): Promise<PersonaAccess> {
    const access = await this.requireMember(userId, personaId);
    if (!roles.includes(access.membership.role as MembershipRole)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "PERSONA_FORBIDDEN",
        "You do not have access to perform this action on this persona.",
      );
    }
    return access;
  }

  async requireOwner(userId: string, personaId: string): Promise<PersonaAccess> {
    return this.requireRoles(userId, personaId, ["owner"]);
  }

  async requireOwnerOrManager(
    userId: string,
    personaId: string,
  ): Promise<PersonaAccess> {
    return this.requireRoles(userId, personaId, ["owner", "manager"]);
  }

  /** True if the user has any membership on an active (non-deleted) persona. */
  async isMember(userId: string, personaId: string): Promise<boolean> {
    try {
      await this.requireMember(userId, personaId);
      return true;
    } catch (err) {
      if (err instanceof ApiException && err.getStatus() === HttpStatus.NOT_FOUND) {
        return false;
      }
      throw err;
    }
  }

  private async loadActivePersona(personaId: string) {
    const persona = await this.db.query.personas.findFirst({
      where: and(eq(personas.id, personaId), isNull(personas.deletedAt)),
    });
    if (!persona) {
      throw this.notFound();
    }
    return persona;
  }

  private async loadMembership(userId: string, personaId: string) {
    return this.db.query.personaMemberships.findFirst({
      where: and(
        eq(personaMemberships.personaId, personaId),
        eq(personaMemberships.userId, userId),
      ),
    });
  }

  private notFound() {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "PERSONA_NOT_FOUND",
      "Persona not found.",
    );
  }
}
