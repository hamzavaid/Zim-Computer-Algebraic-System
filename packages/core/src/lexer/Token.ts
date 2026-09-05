import { TokenType } from "./TokenType";

export interface Token {
  readonly type: TokenType;
  readonly lexeme: string;
  readonly start: number;
  readonly end: number;
}
