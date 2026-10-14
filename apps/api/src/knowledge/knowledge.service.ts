import { Inject, Injectable, Logger } from "@nestjs/common";
import { ChunkEmbeddingService } from "../embeddings/chunk-embedding.service";
import { MemoryExtractService } from "../memory/memory-extract.service";
import { PersonaAccessService } from "../personas/persona-access.service";
import { TraitExtractService } from "../personality/trait-extract.service";
import { AuditService } from "../auth/audit.service";

/**
 * Rebuild embeddings + trait/memory drafts from already-imported sources.
 * Used after WhatsApp subject mapping or for existing imports that never ran extract.
 */
@Injectable()
export class KnowledgeService {
  private readonly log = new Logger(KnowledgeService.name);

  constructor(
    @Inject(PersonaAccessService) private readonly access: PersonaAccessService,
    @Inject(ChunkEmbeddingService)
    private readonly embeddings: ChunkEmbeddingService,
    @Inject(TraitExtractService) private readonly traits: TraitExtractService,
    @Inject(MemoryExtractService)
    private readonly memoryExtract: MemoryExtractService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async rebuildFromImports(userId: string, personaId: string) {
    await this.access.requireOwnerOrManager(userId, personaId);

    // ~50×64 ≈ 3200 chunks per click; large WhatsApp exports need multiple clicks
    // until remaining=0 (or leave the worker running after map-subject).
    const { embedded, remaining, model } =
      await this.embeddings.embedPersonaChunks(personaId, {
        limit: 64,
        maxBatches: 50,
      });
    const traits = await this.traits.extractForPersona(personaId);
    const memories = await this.memoryExtract.extractBiographical(personaId);

    this.log.log(
      `rebuild persona=${personaId} embedded=${embedded} remaining=${remaining} B=${traits.classBInserted} C=${traits.classCInserted} mem=${memories.inserted}`,
    );

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "knowledge.rebuild",
      targetType: "persona",
      targetId: personaId,
      metadata: {
        embedded,
        remaining,
        model,
        classBInserted: traits.classBInserted,
        classCInserted: traits.classCInserted,
        memoriesInserted: memories.inserted,
      },
    });

    return {
      embedded,
      remaining,
      embedComplete: remaining === 0,
      model,
      traits: {
        classBInserted: traits.classBInserted,
        classCInserted: traits.classCInserted,
        classCDroppedFakeQuotes: traits.classCDroppedFakeQuotes,
        sampleSize: traits.sampleSize,
        note: "Class B (measured) is auto-confirmed for chat. Class C stays in Review inbox.",
      },
      memories: {
        inserted: memories.inserted,
        droppedFakeQuotes: memories.droppedFakeQuotes,
        sampleSize: memories.sampleSize,
        note: "Biographical drafts are pending_review until you Confirm them in Review.",
      },
    };
  }
}
