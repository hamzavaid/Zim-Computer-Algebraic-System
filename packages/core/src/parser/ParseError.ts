import { ZimError } from "../errors/ZimError";

export class ParseError extends ZimError {
  constructor(message: string, start: number, end = start) {
    super("PARSE_ERROR", message, start, end);
    this.name = "ParseError";
  }
}
