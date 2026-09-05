import { ZimError } from "../errors/ZimError";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

const singleCharacters: Readonly<Record<string, TokenType>> = {
  "+": "plus",
  "-": "minus",
  "*": "star",
  "/": "slash",
  "%": "modulo",
  "^": "power",
  "(": "leftParen",
  ")": "rightParen",
  ",": "comma",
  "|": "pipe",
  "=": "equal",
  "<": "less",
  ">": "greater",
  "≠": "notEqual",
  "≤": "lessEqual",
  "≥": "greaterEqual",
};

export class Lexer {
  private position = 0;
  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.position < this.source.length) {
      const char = this.source[this.position]!;
      if (/\s/u.test(char)) {
        this.position++;
        continue;
      }
      if (/\d/u.test(char) || (char === "." && /\d/u.test(this.peek(1)))) {
        tokens.push(this.number());
        continue;
      }
      if (/[A-Za-z_]/u.test(char)) {
        tokens.push(this.identifier());
        continue;
      }

      const start = this.position;
      const pair = this.source.slice(start, start + 2);
      const pairType: TokenType | undefined =
        pair === "!="
          ? "notEqual"
          : pair === "<="
            ? "lessEqual"
            : pair === ">="
              ? "greaterEqual"
              : undefined;
      if (pairType) {
        this.position += 2;
        tokens.push({ type: pairType, lexeme: pair, start, end: this.position });
        continue;
      }
      const type = singleCharacters[char];
      if (!type)
        throw new ZimError(
          "LEX_ERROR",
          `Unknown character '${char}' at offset ${start}`,
          start,
          start + 1,
        );
      this.position++;
      tokens.push({ type, lexeme: char, start, end: this.position });
    }
    tokens.push({ type: "eof", lexeme: "", start: this.position, end: this.position });
    return tokens;
  }

  private peek(distance: number): string {
    return this.source[this.position + distance] ?? "";
  }

  private number(): Token {
    const start = this.position;
    let sawDot = false;
    while (this.position < this.source.length) {
      const char = this.source[this.position]!;
      if (/\d/u.test(char)) {
        this.position++;
        continue;
      }
      if (char === "." && !sawDot) {
        sawDot = true;
        this.position++;
        continue;
      }
      break;
    }
    const lexeme = this.source.slice(start, this.position);
    if (lexeme === "." || lexeme.endsWith(".")) {
      throw new ZimError(
        "LEX_ERROR",
        `Malformed number '${lexeme}' at offset ${start}`,
        start,
        this.position,
      );
    }
    return { type: "number", lexeme, start, end: this.position };
  }

  private identifier(): Token {
    const start = this.position++;
    while (/[A-Za-z0-9_]/u.test(this.source[this.position] ?? "")) this.position++;
    const lexeme = this.source.slice(start, this.position);
    return {
      type: lexeme.toLowerCase() === "mod" ? "modulo" : "identifier",
      lexeme,
      start,
      end: this.position,
    };
  }
}

export const lex = (source: string): Token[] => new Lexer(source).tokenize();
