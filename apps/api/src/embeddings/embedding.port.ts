export type EmbeddingRequest = {
  /** Persona that owns the text — used for send_to_provider consent. */
  personaId: string;
  texts: string[];
  model?: string;
};

export type EmbeddingResult = {
  model: string;
  dims: number;
  vectors: number[][];
};

export interface EmbeddingPort {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export const EMBEDDING_PORT = Symbol("EMBEDDING_PORT");
