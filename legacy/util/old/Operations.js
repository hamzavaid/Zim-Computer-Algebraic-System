// ----------------------
// Parser Class
// ----------------------
class Parser {
    constructor() {
        this.pos = 0;
        this.tokens = [];
    }

    tokenize(expression) {
        const regex = /([0-9]+\.?[0-9]*|\+|\-|\*|\/|\^|\(|\)|\=|ln|\w+)/g;
        return expression.match(regex) || [];
    }

    parse(expression) {
        this.tokens = this.tokenize(expression.replace(/\s+/g, ''));
        this.pos = 0;
        let result;
        const left = this.parseExpression();
        if (this.peek() === '=') {
            this.consume(); // consume '='
            const right = this.parseExpression();
            result = new Equation(left, right);
        } else {
            result = left;
        }

        // If a variable is provided and the result is an Equation,
        // check if theres a polynomial structure.
    if (result instanceof Equation) {
        result = result.simplify();
        const polyExpr = new Subtract(result.left, result.right).simplify();
        if (isPolynomial(polyExpr)) {
            return new Polynomial(polyExpr);
        }
    }

        return result;
    }

    peek() {
        return this.tokens[this.pos];
    }

    consume() {
        return this.tokens[this.pos++];
    }

    parseExpression() {
        let left = this.parseTerm();
        while (this.peek() === '+' || this.peek() === '-') {
            const operator = this.consume();
            const right = this.parseTerm();
            left = operator === '+' ? new Add(left, right) : new Subtract(left, right);
        }
        return left;
    }

    parseTerm() {
        let left = this.parseFactor();
        while (this.peek() === '*' || this.peek() === '/') {
            const operator = this.consume();
            const right = this.parseFactor();
            left = operator === '*' ? new Multiply(left, right) : new Divide(left, right);
        }
        return left;
    }

    parseFactor() {
        let left = this.parsePrimary();
        while (this.peek() === '^') {
            this.consume(); // consume '^'
            const right = this.parsePrimary();
            left = new Power(left, right);
        }
        return left;
    }

    parsePrimary() {
        const token = this.peek();
        if (!token) throw new Error("Unexpected end of expression");

        // Handle unary +/- operators
        if (token === '+' || token === '-') {
            this.consume();
            const expr = this.parsePrimary();
            return token === '+' ? expr : new Subtract(new Const(0), expr);
        }

        // Handle logarithm function
        if (token === 'ln') {
            this.consume();
            this.consumeExpected('(');
            const arg = this.parseExpression();
            this.consumeExpected(')');
            return new Log(arg);
        }

        // Handle parenthesized expressions
        if (token === '(') {
            this.consume();
            const expr = this.parseExpression();
            this.consumeExpected(')');
            return expr;
        }

        // Handle numbers (as positive constants)
        if (/^[0-9]+\.?[0-9]*$/.test(token)) {
            this.consume();
            return new Const(parseFloat(token));
        }

        // Handle variables
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) {
            this.consume();
            if (token === 'e') return new Const(Math.E);
            if (token === 'pi') return new Const(Math.PI);
            return new Variable(token);
        }

        throw new Error(`Unexpected token: ${token}`);
    }

    consumeExpected(str) {
        if (this.peek() !== str) throw new Error(`Expected '${str}' but got '${this.peek()}'`);
        this.consume();
    }
}

// ----------------------
// Base Expression Class
// ----------------------
class Expression {
    simplify() { 
        throw new Error("simplify() not implemented");
    }
    differentiate(variable) { 
        throw new Error("differentiate() not implemented");
    }
    evaluate(context) { 
        throw new Error("evaluate() not implemented");
    }
    toString() { 
        throw new Error("toString() not implemented");
    }
}

// ----------------------
// Equation Class
// ----------------------
class Equation extends Expression {
    constructor(left, right) {
        super();
        // Immediately simplify each side.
        this.left = left.simplify();
        this.right = right.simplify();
    }

    solve(variable) {
        if (!this.left || !this.right) {
            throw new Error("Both sides of the equation must be set");
        }

        let mainBranch, otherBranch;
        const leftHasVar = this.containsVariable(this.left, variable);
        const rightHasVar = this.containsVariable(this.right, variable);

        if (leftHasVar) {
            mainBranch = this.left;
            otherBranch = this.right;
        } else if (rightHasVar) {
            mainBranch = this.right;
            otherBranch = this.left;
        } else if (this.left == this.right) {
            return "Any value satisfies the equation";
        } else {
            // If neither side contains the variable, we cannot solve for it.
            return `Variable ${variable} not found in equation`;
        }

        // Direct isolation case:
        if (mainBranch instanceof Variable && mainBranch.name === variable) {
            return otherBranch;
        }

        // Solve based on the mainBranch type:
        switch (mainBranch.constructor.name) {
            case 'Add': {
                const varOnLeft = this.containsVariable(mainBranch.left, variable);
                const varBranch = varOnLeft ? mainBranch.left : mainBranch.right;
                const constBranch = varOnLeft ? mainBranch.right : mainBranch.left;
                const newRight = new Subtract(otherBranch, constBranch).simplify();
                const result = new Equation(varBranch, newRight).solve(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            case 'Subtract': {
                const varOnLeft = this.containsVariable(mainBranch.left, variable);
                if (varOnLeft) {
                    const newRight = new Add(otherBranch, mainBranch.right).simplify();
                    return new Equation(mainBranch.left, newRight).solve(variable);
                } else {
                    const newRight = new Subtract(mainBranch.left, otherBranch).simplify();
                    return new Equation(mainBranch.right, newRight).solve(variable);
                }
            }
            case 'Multiply': {
                const varOnLeft = this.containsVariable(mainBranch.left, variable);
                const varBranch = varOnLeft ? mainBranch.left : mainBranch.right;
                const constBranch = varOnLeft ? mainBranch.right : mainBranch.left;
                const newRight = new Divide(otherBranch, constBranch).simplify();
                const result = new Equation(varBranch, newRight).solve(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            case 'Divide': {
                const varOnLeft = this.containsVariable(mainBranch.left, variable);
                if (varOnLeft) {
                    const newRight = new Multiply(otherBranch, mainBranch.right).simplify();
                    const result = new Equation(mainBranch.left, newRight).solve(variable);
                    return Array.isArray(result) ? result.flat() : result;
                } else {
                    const newRight = new Divide(mainBranch.left, otherBranch).simplify();
                    const result = new Equation(mainBranch.left, newRight).solve(variable);
                    return Array.isArray(result) ? result.flat() : result;
                }
            }
            case 'Power': {
                const varInBase = this.containsVariable(mainBranch.base, variable);
                if (varInBase) {
                    const reciprocal = new Divide(new Const(1), mainBranch.exponent).simplify();
                    const newRight = new Power(otherBranch, reciprocal).simplify();
                    if (mainBranch.exponent instanceof Const &&
                        Number.isInteger(mainBranch.exponent.value) &&
                        mainBranch.exponent.value % 2 === 0) {
                        // ± branch
                        const principal = newRight.simplify();
                        return [principal, new Multiply(new Const(-1), principal).simplify()];
                    }
                    const result = new Equation(mainBranch.base, newRight).solve(variable);
                    return Array.isArray(result) ? result.flat() : result;
                } else {
                    const newRight = new Divide(
                        new Log(otherBranch),
                        new Log(mainBranch.base)
                    ).simplify();
                    if (mainBranch.exponent instanceof Const &&
                        Number.isInteger(mainBranch.exponent.value) &&
                        mainBranch.exponent.value % 2 === 0) {
                        // ± branch
                        const principal = newRight.simplify();
                        return [principal, new Multiply(new Const(-1), principal).simplify()];
                    }
                    const result = new Equation(mainBranch.base, newRight).solve(variable);
                    return Array.isArray(result) ? result.flat() : result;
                }
            }
            case 'Log': {
                const newRight = new Power(new Const(Math.E), otherBranch).simplify();
                const result = new Equation(mainBranch.arg, newRight).solve(variable);
                return Array.isArray(result) ? result.flat() : result;
            }
            default:
                throw new Error(`Unsupported operation: ${mainBranch.constructor.name}`);
        }
    }

    containsVariable(expr, variable) {
        if (expr instanceof Variable)
            return expr.name === variable;
        if (expr instanceof Const)
            return false;
        if (expr instanceof Log)
            return this.containsVariable(expr.arg, variable);
        if (expr.left && expr.right)
            return this.containsVariable(expr.left, variable) || this.containsVariable(expr.right, variable);
        return false;
    }

    simplify() {
        const left = this.left.simplify();
        const right = this.right.simplify();
        // Attempt to combine constant terms across the equation
        if (left instanceof Add && left.right instanceof Const &&
            right instanceof Add && right.right instanceof Const) {
            const combined = new Const(right.right.value - left.right.value);
            return new Equation(left.left, new Add(right.left, combined).simplify());
        }
        if (left instanceof Add && left.right instanceof Const &&
            right instanceof Add && right.right instanceof Const) {
            const combined = new Const(right.right.value - left.right.value);
            return new Equation(left.left, new Add(right.left, combined).simplify());
        }
        return new Equation(left, right);
    }

    evaluate(context) {
        return this.left.evaluate(context) === this.right.evaluate(context);
    }

    differentiate(variable) {
        return new Equation(
            this.left.differentiate(variable),
            this.right.differentiate(variable)
        );
    }

    toString() {
        return `${this.left.toString()} = ${this.right.toString()}`;
    }
}

// ----------------------
// Leaf Nodes: Const and Variable
// ----------------------
class Const extends Expression {
    constructor(value) {
        super();
        this.value = value;
    }

    evaluate(context) {
        return this.value;
    }

    simplify() {
        return this;
    }

    differentiate(variable) {
        return new Const(0);
    }

    toString() {
        return this.value.toString();
    }
}

class Variable extends Expression {
    constructor(name) {
        super();
        this.name = name;
    }

    evaluate(context) {
        return context[this.name] || 0;
    }

    simplify() {
        return this;
    }

    differentiate(variable) {
        return this.name === variable ? new Const(1) : new Const(0);
    }

    toString() {
        return this.name;
    }
}

// ----------------------
// Binary Operator Base Class
// ----------------------
class BinaryOp extends Expression {
    constructor(left, right) {
        super();
        this.left = typeof left === 'number' ? new Const(left) : left;
        this.right = typeof right === 'number' ? new Const(right) : right;
    }
}

// ----------------------
// Add Class
// ----------------------
class Add extends BinaryOp {
    evaluate(context) {
        return this.left.evaluate(context) + this.right.evaluate(context);
    }

    simplify() {
        const left = this.left.simplify();
        const right = this.right.simplify();
        // Constant folding
        if (left instanceof Const && right instanceof Const)
            return new Const(left.value + right.value);
        if (left instanceof Const && left.value === 0)
            return right;
        if (right instanceof Const && right.value === 0)
            return left;
        if (left instanceof Add && right instanceof Const) {
            // NEW RULE: A + C1 + C2 = A + (C1 + C2)
            return new Add(left.left, new Const(left.right.value + right.value)).simplify();
        }
        if (right instanceof Add && left instanceof Const) {
            // NEW RULE: C1 + A + C2 = A + (C1 + C2)
            return new Add(right.left, new Const(left.value + right.right.value)).simplify();
        }
        if (right instanceof Variable && left instanceof Variable && left.name === right.name) {
            // NEW RULE: A + A = 2 * A  
            return new Multiply(new Const(2), left).simplify();
        }
        return new Add(left, right);
    }

    differentiate(variable) {
        return new Add(
            this.left.differentiate(variable),
            this.right.differentiate(variable)
        );
    }

    toString() {
        return `(${this.left.toString()} + ${this.right.toString()})`;
    }
}

// ----------------------
// Subtract Class
// ----------------------
class Subtract extends BinaryOp {
    evaluate(context) {
        return this.left.evaluate(context) - this.right.evaluate(context);
    }

    simplify() {
        const left = this.left.simplify();
        const right = this.right.simplify();

        // NEW RULE: (A + C1) - C2 = A + (C1 - C2)
        if (left instanceof Add && left.right instanceof Const && right instanceof Const) {
            return new Add(left.left, new Const(left.right.value - right.value)).simplify();
        }
        // NEW RULE: C1 - (A + C2) = (C1 - C2) - A
        if (right instanceof Add && right.right instanceof Const && left instanceof Const) {
            return new Add(right.left, new Const(left.value - right.right.value)).simplify();
        }
        // NEW RULE: A - A = 0
        if (left instanceof Variable && right instanceof Variable && left.name === right.name) {
            return new Const(0);
        }
        // Constant folding
        if (left instanceof Const && right instanceof Const)
            return new Const(left.value - right.value);
        if (right instanceof Const && right.value === 0)
            return left;
        if (left instanceof Const && left.value === 0)
            return new Multiply(new Const(-1), right).simplify();
        return new Subtract(left, right);
    }

    differentiate(variable) {
        return new Subtract(
            this.left.differentiate(variable),
            this.right.differentiate(variable)
        );
    }

    toString() {
        return `(${this.left.toString()} - ${this.right.toString()})`;
    }
}

// ----------------------
// Multiply Class
// ----------------------
class Multiply extends BinaryOp {
    evaluate(context) {
        return this.left.evaluate(context) * this.right.evaluate(context);
    }

    simplify() {
        const left = this.left.simplify();
        const right = this.right.simplify();
        // Zero and one rules
        if ((left instanceof Const && left.value === 0) ||
            (right instanceof Const && right.value === 0)) return new Const(0);
        if (left instanceof Const && left.value === 1) return right;
        if (right instanceof Const && right.value === 1) return left;
        // x * x = x^2
        if (left instanceof Variable && right instanceof Variable && left.name === right.name) return new Power(left, new Const(2));
        // Both constants: fold
        if (left instanceof Const && right instanceof Const) return new Const(left.value * right.value);
        return new Multiply(left, right);
    }

    differentiate(variable) {
        return new Add(
            new Multiply(this.left.differentiate(variable), this.right),
            new Multiply(this.left, this.right.differentiate(variable))
        );
    }

    toString() {
        return `(${this.left.toString()} * ${this.right.toString()})`;
    }
}

// ----------------------
// Divide Class
// ----------------------
class Divide extends BinaryOp {
    evaluate(context) {
        const denom = this.right.evaluate(context);
        if (denom === 0) throw new Error("Division by zero");
        return this.left.evaluate(context) / denom;
    }

    simplify() {
        const left = this.left.simplify();
        const right = this.right.simplify();
        if (left instanceof Const && left.value === 0) return new Const(0);
        if (right instanceof Const && right.value === 1) return left;
        // x / x = 1
        if (left instanceof Variable && right instanceof Variable && left.name === right.name) return new Const(1);
        // Both constants: fold (avoid division by zero)
        if (left instanceof Const && right instanceof Const && right.value !== 0) return new Const(left.value / right.value);
        return new Divide(left, right);
    }

    differentiate(variable) {
        const num = new Subtract(
            new Multiply(this.left.differentiate(variable), this.right),
            new Multiply(this.left, this.right.differentiate(variable))
        );
        const denom = new Multiply(this.right, this.right);
        return new Divide(num, denom);
    }

    toString() {
        return `(${this.left.toString()} / ${this.right.toString()})`;
    }
}

// ----------------------
// Power Class
// ----------------------
class Power extends BinaryOp {
    constructor(base, exponent) {
        super(base, exponent);
        this.base = this.left;
        this.exponent = this.right;
    }

    evaluate(context) {
        return Math.pow(this.base.evaluate(context), this.exponent.evaluate(context));
    }

    simplify() {
        const base = this.base.simplify();
        const exponent = this.exponent.simplify();
        if (exponent instanceof Const && exponent.value === 0) return new Const(1);
        if (exponent instanceof Const && exponent.value === 1) return base;
        if (base instanceof Const && base.value === 1) return new Const(1);
        if (base instanceof Const && exponent instanceof Const)
            return new Const(Math.pow(base.value, exponent.value));
        return new Power(base, exponent);
    }

    differentiate(variable) {
        // If exponent is constant, use standard power rule.
        if (this.exponent instanceof Const) {
            const coeff = new Multiply(this.exponent, new Power(this.base, new Subtract(this.exponent, new Const(1))));
            return new Multiply(coeff, this.base.differentiate(variable));
        }
        // Else, use logarithmic differentiation
        return new Multiply(
            new Power(this.base, this.exponent),
            new Add(
                new Multiply(this.exponent.differentiate(variable), new Log(this.base)),
                new Multiply(
                    this.exponent,
                    new Divide(this.base.differentiate(variable), this.base)
                )
            )
        );
    }

    toString() {
        return `(${this.base.toString()} ^ ${this.exponent.toString()})`;
    }
}

// ----------------------
// Log Class
// ----------------------
class Log extends Expression {
    constructor(arg) {
        super();
        this.arg = typeof arg === "number" ? new Const(arg) : arg;
    }

    evaluate(context) {
        const val = this.arg.evaluate(context);
        if (val <= 0) throw new Error("Logarithm of non-positive number is undefined");
        return Math.log(val);
    }

    simplify() {
        const arg = this.arg.simplify();
        if (arg instanceof Const) {
            if (arg.value === 1) return new Const(0);
            if (arg.value === Math.E) return new Const(1);
        }
        // ln(x^n) = n * ln(x)
        if (arg instanceof Power) {
            return new Multiply(arg.exponent, new Log(arg.base)).simplify();
        }
        return new Log(arg);
    }

    differentiate(variable) {
        return new Divide(this.arg.differentiate(variable), this.arg);
    }

    toString() {
        return `ln(${this.arg.toString()})`;
    }
}

function isPolynomial(node) {
    const variables = new Set();

    function walk(n) {
        if (n instanceof Const) return true;

        if (n instanceof Variable) {
            variables.add(n.name);
            return true;
        }

        if (n instanceof Add || n instanceof Subtract || n instanceof Multiply) {
            return walk(n.left) && walk(n.right);
        }

        if (n instanceof Power) {
            // base must be a variable, exponent must be a non-negative integer constant
            if (
                n.base instanceof Variable &&
                n.exponent instanceof Const &&
                Number.isInteger(n.exponent.value) &&
                n.exponent.value >= 0
            ) {
                variables.add(n.base.name);
                return true;
            }
            return false;
        }

        // All other nodes (Log, Divide, etc.) invalidate it
        return false;
    }

    const valid = walk(node);
    if (!valid) return false;
    return variables.size === 1; // Only one variable allowed for univariate polynomial
}

class Polynomial {
    constructor(node, variable = 'x') {
        this.variable = variable;
        if (!isPolynomial(node, variable)) {
            throw new Error('Not a valid polynomial');
        }
        this.coefficients = Polynomial.extractCoefficients(node, variable);
    }

    // Evaluate the polynomial at a given x value
    evaluate(x) {
        return this.coefficients.reduce((sum, coeff, i) => sum + coeff * x ** i, 0);
    }

    // Return the degree
    degree() {
        return this.coefficients.length - 1;
    }

    // Solve (up to quadratic)
    solve() {
        const c = this.coefficients;
        const deg = this.degree();

        if (deg === 0) {
            return c[0] === 0 ? 'All real numbers' : 'No solution';
        }

        if (deg === 1) {
            // ax + b = 0 ⇒ x = -b / a
            return -c[0] / c[1];
        }

        if (deg === 2) {
            const [c0, c1, c2] = c;
            const D = c1 ** 2 - 4 * c2 * c0;
            if (D < 0) return [];
            if (D === 0) return [-c1 / (2 * c2)];
            const sqrtD = Math.sqrt(D);
            return [(-c1 + sqrtD) / (2 * c2), (-c1 - sqrtD) / (2 * c2)].join(', ');
        }

        return 'Solving degree > 2 not implemented';
    }

    toString() {
        return this.coefficients
            .map((coeff, i) => {
                if (coeff === 0) return '';
                const sign = coeff > 0 ? '+' : '-';
                const absCoeff = Math.abs(coeff);
                const term = i === 0 ? `${absCoeff}` : `${absCoeff}${this.variable}${i > 1 ? `^${i}` : ''}`;
                return `${sign} ${term}`.trim();
            })
            .filter(term => term !== '')
            .reverse()
            .join(' ')
            .replace(/^\+ /, ''); // Remove leading '+ '
    }

    // --- STATIC HELPERS ---

    static extractCoefficients(node, variable) {
        // Build a degree → coefficient map
        const map = new Map();

        function walk(n) {
            if (n instanceof Const) {
                map.set(0, (map.get(0) || 0) + n.value);
            } else if (n instanceof Variable && n.name === variable) {
                map.set(1, (map.get(1) || 0) + 1);
            } else if (n instanceof Add || n instanceof Subtract) {
                const factor = n instanceof Subtract ? -1 : 1;
                walk(n.left);
                const rightCopy = Polynomial.multiplyByFactor(n.right, factor);
                walk(rightCopy);
            } else if (n instanceof Multiply) {
                const left = Polynomial.flattenProduct(n.left, variable);
                const right = Polynomial.flattenProduct(n.right, variable);
                const degree = left.degree + right.degree;
                const coeff = left.coeff * right.coeff;
                map.set(degree, (map.get(degree) || 0) + coeff);
            } else if (n instanceof Power) {
                const exp = n.exponent.value;
                map.set(exp, (map.get(exp) || 0) + 1);
            } else if (n instanceof Variable && n.name !== variable) {
                throw new Error('Unexpected variable: ' + n.name);
            }
        }

        walk(node);

        const maxDegree = Math.max(...map.keys(), 0);
        const coeffs = Array(maxDegree + 1).fill(0);
        for (const [d, c] of map.entries()) {
            coeffs[d] = c;
        }
        return coeffs;
    }

    static flattenProduct(node, variable) {
        if (node instanceof Const) return { degree: 0, coeff: node.value };
        if (node instanceof Variable && node.name === variable) return { degree: 1, coeff: 1 };
        if (node instanceof Power && node.base instanceof Variable && node.exponent instanceof Const) {
            return { degree: node.exponent.value, coeff: 1 };
        }
        throw new Error('Unsupported multiplication operand: ' + node.constructor.name);
    }

    static multiplyByFactor(node, factor) {
        if (node instanceof Const) return new Const(node.value * factor);
        if (node instanceof Variable) return new Multiply(new Const(factor), node);
        if (node instanceof Multiply && node.left instanceof Const) {
            return new Multiply(new Const(node.left.value * factor), node.right);
        }
        return new Multiply(new Const(factor), node);
    }
}


// ----------------------
// Exported Classes
// ----------------------
module.exports = {
    Parser,
    Const,
    Variable,
    Add,
    Subtract,
    Multiply,
    Divide,
    Power,
    Log,
    Equation,
    Polynomial
};