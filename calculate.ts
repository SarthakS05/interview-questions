// pages/api/calculate.ts
// Backend logic: safely evaluate a math expression server-side.
// We deliberately avoid eval() and use a recursive-descent parser instead.

import type { NextApiRequest, NextApiResponse } from "next";

type Result = { result: number | string; error?: string };

// ── Tokeniser ────────────────────────────────────────────────────────────────

type Token =
  | { type: "NUM"; value: number }
  | { type: "OP"; value: string }
  | { type: "LPAREN" }
  | { type: "RPAREN" };

function tokenise(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: "NUM", value: parseFloat(num) });
      continue;
    }
    if ("+-*/^%".includes(ch)) { tokens.push({ type: "OP", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "LPAREN" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "RPAREN" }); i++; continue; }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

// ── Recursive-descent parser ─────────────────────────────────────────────────
// Grammar:
//   expr   → term (('+' | '-') term)*
//   term   → factor (('*' | '/' | '%') factor)*
//   factor → base ('^' factor)?          (right-associative)
//   base   → NUM | '(' expr ')' | '-' base

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }

  parse(): number {
    const val = this.expr();
    if (this.peek()) throw new Error("Unexpected token");
    return val;
  }

  private expr(): number {
    let left = this.term();
    while (this.peek()?.type === "OP" && "+-".includes((this.peek() as { type: "OP"; value: string }).value)) {
      const op = (this.consume() as { type: "OP"; value: string }).value;
      const right = this.term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.factor();
    while (this.peek()?.type === "OP" && "*/%".includes((this.peek() as { type: "OP"; value: string }).value)) {
      const op = (this.consume() as { type: "OP"; value: string }).value;
      const right = this.factor();
      if (op === "*") left = left * right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else left = left % right;
    }
    return left;
  }

  private factor(): number {
    const base = this.base();
    if (this.peek()?.type === "OP" && (this.peek() as { type: "OP"; value: string }).value === "^") {
      this.consume();
      return Math.pow(base, this.factor()); // right-associative
    }
    return base;
  }

  private base(): number {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.type === "NUM") { this.consume(); return tok.value; }
    if (tok.type === "LPAREN") {
      this.consume();
      const val = this.expr();
      if (this.peek()?.type !== "RPAREN") throw new Error("Missing closing parenthesis");
      this.consume();
      return val;
    }
    if (tok.type === "OP" && tok.value === "-") {
      this.consume();
      return -this.base();
    }
    throw new Error("Unexpected token");
  }
}

function evaluate(expr: string): number {
  const tokens = tokenise(expr);
  return new Parser(tokens).parse();
}

// ── API handler ──────────────────────────────────────────────────────────────

export default function handler(req: NextApiRequest, res: NextApiResponse<Result>) {
  if (req.method !== "POST") return res.status(405).json({ result: "", error: "Method not allowed" });

  const { expression } = req.body as { expression?: string };
  if (!expression || typeof expression !== "string") {
    return res.status(400).json({ result: "", error: "Missing expression" });
  }
  if (expression.length > 500) {
    return res.status(400).json({ result: "", error: "Expression too long" });
  }

  try {
    const result = evaluate(expression);
    if (!isFinite(result)) return res.status(400).json({ result: "", error: "Result is not finite" });
    return res.status(200).json({ result });
  } catch (err) {
    return res.status(400).json({ result: "", error: (err as Error).message });
  }
}
