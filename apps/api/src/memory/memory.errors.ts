export class MemoryDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MemoryDomainError";
    this.code = code;
  }
}
