import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  memories,
  memoryEvidence,
  personalityEvidence,
  personalityTraits,
  type MemoraDb,
} from "@memora/db";
import type { MemoryCorrectBody, ReviewDecisionBody } from "@memora/shared";
import { and, desc, eq } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";
import { PersonaAccessService } from "../personas/persona-access.service";

@Injectable()
export class ReviewService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(PersonaAccessService) private readonly access: PersonaAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async getQueue(userId: string, personaId: string) {
    await this.access.requireOwnerOrManager(userId, personaId);

    const traits = await this.db.query.personalityTraits.findMany({
      where: and(
        eq(personalityTraits.personaId, personaId),
        eq(personalityTraits.status, "pending_review"),
      ),
      orderBy: [desc(personalityTraits.createdAt)],
    });

    // Load evidence per trait (inbox is small)
    const evidenceByTrait = new Map<
      string,
      Awaited<ReturnType<typeof this.db.query.personalityEvidence.findMany>>
    >();
    for (const t of traits) {
      const ev = await this.db.query.personalityEvidence.findMany({
        where: eq(personalityEvidence.traitId, t.id),
      });
      evidenceByTrait.set(t.id, ev);
    }

    const pendingMemories = await this.db.query.memories.findMany({
      where: and(
        eq(memories.personaId, personaId),
        eq(memories.domain, "biographical"),
        eq(memories.status, "pending_review"),
      ),
      orderBy: [desc(memories.createdAt)],
    });

    const memoryItems = [];
    for (const m of pendingMemories) {
      const ev = await this.db.query.memoryEvidence.findMany({
        where: eq(memoryEvidence.memoryId, m.id),
      });
      memoryItems.push({
        id: m.id,
        kind: "memory" as const,
        domain: m.domain,
        memoryType: m.memoryType,
        text: m.text,
        knowledgeClass: m.knowledgeClass,
        confidence: m.confidence,
        audience: m.audience,
        sensitivity: m.sensitivity,
        status: m.status,
        evidence: ev.map((e) => ({
          id: e.id,
          quote: e.quote,
          messageId: e.messageId,
          chunkId: e.chunkId,
        })),
        createdAt: m.createdAt,
      });
    }

    return {
      traits: traits.map((t) => ({
        id: t.id,
        kind: "trait" as const,
        facet: t.facet,
        value: t.value,
        knowledgeClass: t.knowledgeClass,
        confidence: t.confidence,
        audience: t.audience,
        status: t.status,
        evidence: (evidenceByTrait.get(t.id) ?? []).map((e) => ({
          id: e.id,
          quote: e.quote,
          messageId: e.messageId,
          chunkId: e.chunkId,
        })),
        createdAt: t.createdAt,
      })),
      memories: memoryItems,
      pendingCount: traits.length + memoryItems.length,
    };
  }

  async decideTrait(
    userId: string,
    personaId: string,
    traitId: string,
    body: ReviewDecisionBody,
  ) {
    await this.access.requireOwnerOrManager(userId, personaId);
    const trait = await this.db.query.personalityTraits.findFirst({
      where: and(
        eq(personalityTraits.id, traitId),
        eq(personalityTraits.personaId, personaId),
      ),
    });
    if (!trait) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "TRAIT_NOT_FOUND",
        "Trait not found.",
      );
    }
    if (trait.status !== "pending_review") {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "TRAIT_NOT_PENDING",
        "Trait is not pending review.",
        { status: trait.status },
      );
    }

    if (body.action === "confirm") {
      await this.db
        .update(personalityTraits)
        .set({ status: "confirmed" })
        .where(eq(personalityTraits.id, traitId));
    } else if (body.action === "reject") {
      await this.db
        .update(personalityTraits)
        .set({ status: "rejected" })
        .where(eq(personalityTraits.id, traitId));
    } else {
      await this.db
        .update(personalityTraits)
        .set({
          status: "confirmed",
          value: body.value!.trim(),
        })
        .where(eq(personalityTraits.id, traitId));
    }

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: `trait.${body.action}`,
      targetType: "personality_trait",
      targetId: traitId,
      metadata: { value: body.value ?? null },
    });

    const updated = await this.db.query.personalityTraits.findFirst({
      where: eq(personalityTraits.id, traitId),
    });
    return {
      id: traitId,
      status: updated!.status,
      value: updated!.value,
      retrievalAllowed: updated!.status === "confirmed",
    };
  }

  async decideMemory(
    userId: string,
    personaId: string,
    memoryId: string,
    body: ReviewDecisionBody,
  ) {
    await this.access.requireOwnerOrManager(userId, personaId);
    const memory = await this.requirePendingBioMemory(personaId, memoryId);

    if (body.action === "correct") {
      return this.correctMemory(userId, personaId, memoryId, {
        text: body.value!,
      });
    }

    if (body.action === "confirm") {
      await this.db
        .update(memories)
        .set({ status: "confirmed" })
        .where(eq(memories.id, memoryId));
    } else {
      await this.db
        .update(memories)
        .set({ status: "rejected" })
        .where(eq(memories.id, memoryId));
    }

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: `memory.${body.action}`,
      targetType: "memory",
      targetId: memoryId,
    });

    const updated = await this.db.query.memories.findFirst({
      where: eq(memories.id, memoryId),
    });
    return {
      id: memoryId,
      status: updated!.status,
      text: updated!.text,
      /** Confirmed biographical memories are eligible for retrieval. */
      retrievalAllowed: updated!.status === "confirmed",
      domain: memory.domain,
    };
  }

  async correctMemory(
    userId: string,
    personaId: string,
    memoryId: string,
    body: MemoryCorrectBody,
  ) {
    await this.access.requireOwnerOrManager(userId, personaId);
    const old = await this.requirePendingOrConfirmedBioMemory(
      personaId,
      memoryId,
    );

    const newIdValue = newId();
    await this.db.insert(memories).values({
      id: newIdValue,
      personaId,
      domain: "biographical",
      memoryType: old.memoryType,
      text: body.text.trim(),
      timeStart: old.timeStart,
      timeEnd: old.timeEnd,
      timePrecision: old.timePrecision,
      status: "confirmed",
      knowledgeClass: old.knowledgeClass === "C" ? "D" : old.knowledgeClass,
      confidence: 1,
      audience: old.audience,
      origin: "owner_entered",
      sensitivity: old.sensitivity,
      conversationSessionId: null,
      supersedesId: old.id,
    });

    // Copy evidence quotes onto the correction for audit trail
    const ev = await this.db.query.memoryEvidence.findMany({
      where: eq(memoryEvidence.memoryId, old.id),
    });
    for (const e of ev) {
      await this.db.insert(memoryEvidence).values({
        id: newId(),
        memoryId: newIdValue,
        messageId: e.messageId,
        chunkId: e.chunkId,
        quote: e.quote,
      });
    }

    await this.db
      .update(memories)
      .set({ status: "superseded" })
      .where(eq(memories.id, old.id));

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "memory.correct",
      targetType: "memory",
      targetId: newIdValue,
      metadata: { supersedesId: old.id },
    });

    return {
      id: newIdValue,
      status: "confirmed" as const,
      text: body.text.trim(),
      retrievalAllowed: true,
      supersedesId: old.id,
    };
  }

  private async requirePendingBioMemory(personaId: string, memoryId: string) {
    const memory = await this.db.query.memories.findFirst({
      where: and(
        eq(memories.id, memoryId),
        eq(memories.personaId, personaId),
        eq(memories.domain, "biographical"),
      ),
    });
    if (!memory) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "MEMORY_NOT_FOUND",
        "Memory not found.",
      );
    }
    if (memory.status !== "pending_review") {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "MEMORY_NOT_PENDING",
        "Memory is not pending review.",
        { status: memory.status },
      );
    }
    return memory;
  }

  private async requirePendingOrConfirmedBioMemory(
    personaId: string,
    memoryId: string,
  ) {
    const memory = await this.db.query.memories.findFirst({
      where: and(
        eq(memories.id, memoryId),
        eq(memories.personaId, personaId),
        eq(memories.domain, "biographical"),
      ),
    });
    if (!memory) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "MEMORY_NOT_FOUND",
        "Memory not found.",
      );
    }
    if (
      memory.status !== "pending_review" &&
      memory.status !== "confirmed"
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "MEMORY_NOT_EDITABLE",
        "Memory cannot be corrected in its current status.",
        { status: memory.status },
      );
    }
    return memory;
  }
}
