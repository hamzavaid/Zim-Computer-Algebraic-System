export type ZimErrorCode = "LEX_ERROR" | "PARSE_ERROR" | "DOMAIN_ERROR" | "ITERATION_LIMIT";

export class ZimError extends Error {
  constructor(
    public readonly code: ZimErrorCode,
    message: string,
    public readonly start?: number,
    public readonly end?: number,
  ) {
    super(message);
    this.name = "ZimError";
  }
}
