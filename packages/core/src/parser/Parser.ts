import { binary, equation, Expression, func, SyntaxTree, unary, variable } from "../ast/types";
import { decimalToExact } from "../ast/rational";
import { lex } from "../lexer/Lexer";
import { Token } from "../lexer/Token";
import { TokenType } from "../lexer/TokenType";
import { ParseError } from "./ParseError";

const relationTokens: readonly TokenType[] = [
  "equal",
  "notEqual",
  "less",
  "lessEqual",
  "greater",
  "greaterEqual",
];

export class Parser {
  private current = 0;
  private readonly tokens: Token[];
  constructor(private readonly source: string) {
    this.tokens = lex(source);
  }

  parse(): SyntaxTree {
    if (this.check("eof")) throw this.error(this.peek(), "Expected an expression");
    const left = this.additive();
    if (relationTokens.includes(this.peek().type)) {
      const relation = this.advance();
      if (relation.type !== "equal") {
        throw this.error(
          relation,
          `Relation '${relation.lexeme}' is tokenized but only equations using '=' are supported`,
        );
      }
      const right = this.additive();
      this.consume("eof", "Unexpected input after equation");
      return equation(left, right);
    }
    this.consume("eof", "Unexpected input after expression");
    return left;
  }

  private additive(): Expression {
    let expression = this.multiplicative();
    while (this.match("plus", "minus")) {
      const operator = this.previous().type === "plus" ? "+" : "-";
      expression = binary(operator, expression, this.multiplicative());
    }
    return expression;
  }

  private multiplicative(): Expression {
    let expression = this.unary();
    while (this.match("star", "slash", "modulo")) {
      const operator =
        this.previous().type === "star" ? "*" : this.previous().type === "slash" ? "/" : "%";
      expression = binary(operator, expression, this.unary());
    }
    return expression;
  }

  private unary(): Expression {
    if (this.match("plus")) return unary("+", this.unary());
    if (this.match("minus")) return unary("-", this.unary());
    return this.power();
  }

  private power(): Expression {
    const left = this.primary();
    return this.match("power") ? binary("^", left, this.unary()) : left;
  }

  private primary(): Expression {
    if (this.match("number")) return decimalToExact(this.previous().lexeme);
    if (this.match("identifier")) {
      const name = this.previous().lexeme;
      if (!this.match("leftParen")) return variable(name);
      const args: Expression[] = [];
      if (!this.check("rightParen")) {
        do {
          args.push(this.additive());
        } while (this.match("comma"));
      }
      this.consume("rightParen", `Expected ')' after arguments to ${name}`);
      return func(name, args);
    }
    if (this.match("leftParen")) {
      const expression = this.additive();
      this.consume("rightParen", "Expected ')' after grouped expression");
      return expression;
    }
    if (this.match("pipe")) {
      const expression = this.additive();
      this.consume("pipe", "Expected closing '|' for absolute value");
      return func("abs", [expression]);
    }
    throw this.error(
      this.peek(),
      `Expected expression, found '${this.peek().lexeme || "end of input"}'`,
    );
  }

  private match(...types: TokenType[]): boolean {
    if (!types.some((type) => this.check(type))) return false;
    this.advance();
    return true;
  }
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }
  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }
  private advance(): Token {
    if (!this.check("eof")) this.current++;
    return this.previous();
  }
  private peek(): Token {
    return this.tokens[this.current]!;
  }
  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }
  private error(token: Token, message: string): ParseError {
    return new ParseError(`${message} at offset ${token.start}`, token.start, token.end);
  }
}

export const parse = (source: string): SyntaxTree => new Parser(source).parse();
