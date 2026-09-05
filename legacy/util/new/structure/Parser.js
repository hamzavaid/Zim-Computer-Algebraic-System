const BinaryOp = require('./BinaryOp');
const UnaryOp = require('./UnaryOp');
const Constant = require('../types/leafs/Constant');
const Variable = require('../types/Leafs/Variable');
const Polynomial = require('./Polynomial');
const Equation = require(`./Equation`);

class Parser {
    /* ───────────────────────── TOKENISER ───────────────────────── */
    static #tokenize(input) {
        /* [MOD] add % and word mod */
        const re = /\s*([A-Za-z]+|mod|MOD|Mod|\d+|>=|<=|!=|≠|≥|≤|[=><+\-*/%^()|%])\s*/g;
        const out = [];
        let m;
        while ((m = re.exec(input)) !== null) {
            // normalise keyword 'mod' to '%'
            const tok = m[1];
            if (/^mod$/i.test(tok)) out.push('%');
            else out.push(tok);
        }
        return out;
    }

    /* ──────────────── POLYNOMIAL DETECTION UTILITIES ────────────── */
    static #polyCheck(node, state = { var: null, ok: true }) {
        if (!state.ok) return state; // early exit if already invalid

        if (node instanceof Constant) return state;

        if (node instanceof Variable) {
            if (state.var === null) state.var = node.value;
            else if (state.var !== node.value) state.ok = false;
            return state;
        }

        if (node instanceof UnaryOp) {
            state.ok = false; // any unary op breaks polynomial assumption
            return state;
        }

        if (node instanceof BinaryOp) {
            const op = node.type;
            if (op === '+' || op === '-' || op === '*' || op === '%') {   // [MOD]
                Parser.#polyCheck(node.left, state);
                Parser.#polyCheck(node.right, state);
                return state;
            }
            if (op === '^') {
                if (!(node.right instanceof Constant) || node.right.value % 1 !== 0 || node.right.value < 0) {
                    state.ok = false;
                    return state;
                }
                Parser.#polyCheck(node.left, state);
                return state;
            }
        }

        state.ok = false;
        return state;
    }

    static #wrapIfPolynomial(node) {
        const status = Parser.#polyCheck(node);
        return status.ok && status.var ? new Polynomial(node, status.var) : node;
    }

    /* ──────────────  RECURSIVE-DESCENT GRAMMAR  ────────────── */
    static #parseExpression(tokens, pos = 0) {
        const peek = () => tokens[pos];
        const consume = (exp = null) => {
            if (exp !== null && tokens[pos] !== exp) {
                throw new Error(`Expected '${exp}', got '${tokens[pos]}'`);
            }
            return tokens[pos++];
        };

        // -------- primary --------
        function primary() {
            const tok = peek();

            if (!isNaN(tok)) {
                consume();
                return new Constant(Number(tok));
            }

            if (/^[A-Za-z]+$/.test(tok)) {
                const id = consume(); // take the identifier

                /* ➊  function call ― log(x), sin(y) … ----------------------- */
                if (peek() === '(') {
                    consume('(');
                    const arg = additive();           // parse the argument expression
                    consume(')');
                    return new UnaryOp(arg, id);      // UNARY_TYPES.LOGARITHM, etc.
                }
                return new Variable(id);
            }

            if (tok === '(') {
                consume('(');
                const n = additive();
                consume(')');
                return n;
            }

            throw new Error(`Unexpected token '${tok}'`);
        }

        // -------- exponent (right-associative) --------
        function exponent() {
            let left = primary();
            if (peek() === '^') {
                consume('^');
                const right = exponent(); // recurse → right associativity
                left = new BinaryOp(left, right, '^');
            }
            return left;
        }

        function unary() {
            const tok = peek();
            if (tok === '-') {
                consume('-');
                return new UnaryOp(unary(), '-1'); // UNARY_TYPES.NEGATE
            }
            if (tok === '|') {
                consume('|');
                const inner = additive(); // parse till matching “|”
                if (peek() !== '|') throw new Error("Missing closing '|'");
                consume('|');
                return new UnaryOp(inner, '|'); // UNARY_TYPES.ABSOLUTE
            }
            return exponent();
        }

        // -------- * / % ----------
        function multiplicative() {
            let node = unary();
            while (peek() === '*' || peek() === '/' || peek() === '%') {
                const op = consume();
                node = new BinaryOp(node, unary(), op);
            }
            return node;
        }

        // -------- + - ----------
        function additive() {
            let node = multiplicative();
            while (peek() === '+' || peek() === '-') {
                const op = consume();
                node = new BinaryOp(node, multiplicative(), op);
            }
            return node;
        }

        // -------- equations / relations (lowest precedence) --------
        function comparison() {
            let left = additive();
            const rel = ['=', '≠', '!=', '>', '<', '>=', '≤', '≥', '<='];
            if (rel.includes(peek())) {
                const opRaw = consume();
                const map = { '!=': '≠', '>=': '≥', '<=': '≤' };
                const op = map[opRaw] ?? opRaw;
                const right = additive();
                // wrap polynomial *after* sides are parsed
                left = Parser.#wrapIfPolynomial(left);
                const r = Parser.#wrapIfPolynomial(right);
                return new Equation(left, r, op);
            }
            return Parser.#wrapIfPolynomial(left);
        }

        return { node: comparison(), pos };
    }

    /* ─────────────────────── PUBLIC ENTRY ─────────────────────── */
    static parse(src) {
        const tokens = Parser.#tokenize(src);
        const { node, pos } = Parser.#parseExpression(tokens);
        if (pos < tokens.length) {
            throw new Error('Unexpected tokens remaining: ' + tokens.slice(pos).join(' '));
        }
        return node;
    }
}

module.exports = Parser;