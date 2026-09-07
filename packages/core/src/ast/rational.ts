import { Constant, Rational, constant } from "./types";

export type ExactNumber = Constant | Rational;

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function rational(numerator: bigint, denominator = 1n): ExactNumber {
  if (denominator === 0n) throw new RangeError("A rational denominator cannot be zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  const n = (numerator / divisor) * sign;
  const d = (denominator / divisor) * sign;
  return d === 1n ? constant(n) : { kind: "rational", numerator: n, denominator: d };
}

export function decimalToExact(text: string): ExactNumber {
  if (!text.includes(".")) return constant(BigInt(text));
  const [whole, fraction] = text.split(".") as [string, string];
  return rational(BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length));
}

export const isExactNumber = (value: unknown): value is ExactNumber =>
  typeof value === "object" &&
  value !== null &&
  ((value as ExactNumber).kind === "constant" || (value as ExactNumber).kind === "rational");

export function parts(value: ExactNumber): readonly [bigint, bigint] {
  return value.kind === "constant" ? [value.value, 1n] : [value.numerator, value.denominator];
}

export function addExact(a: ExactNumber, b: ExactNumber): ExactNumber {
  const [an, ad] = parts(a);
  const [bn, bd] = parts(b);
  return rational(an * bd + bn * ad, ad * bd);
}

export function subtractExact(a: ExactNumber, b: ExactNumber): ExactNumber {
  return addExact(a, negateExact(b));
}

export function multiplyExact(a: ExactNumber, b: ExactNumber): ExactNumber {
  const [an, ad] = parts(a);
  const [bn, bd] = parts(b);
  return rational(an * bn, ad * bd);
}

export function divideExact(a: ExactNumber, b: ExactNumber): ExactNumber {
  const [an, ad] = parts(a);
  const [bn, bd] = parts(b);
  if (bn === 0n) throw new RangeError("Division by zero");
  return rational(an * bd, ad * bn);
}

export function negateExact(value: ExactNumber): ExactNumber {
  const [n, d] = parts(value);
  return rational(-n, d);
}

export function powerExact(base: ExactNumber, exponent: bigint): ExactNumber {
  const [n, d] = parts(base);
  if (exponent === 0n && n === 0n) throw new RangeError("0^0 is undefined");
  if (exponent >= 0n) return rational(n ** exponent, d ** exponent);
  if (n === 0n) throw new RangeError("Zero cannot be raised to a negative power");
  const positive = -exponent;
  return rational(d ** positive, n ** positive);
}

export function exactEquals(a: ExactNumber, b: ExactNumber): boolean {
  const [an, ad] = parts(a);
  const [bn, bd] = parts(b);
  return an === bn && ad === bd;
}

export function compareExact(a: ExactNumber, b: ExactNumber): -1 | 0 | 1 {
  const [an, ad] = parts(a);
  const [bn, bd] = parts(b);
  const difference = an * bd - bn * ad;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) throw new RangeError("Square root of a negative integer is not real");
  if (value < 2n) return value;
  let current = 1n << ((BigInt(value.toString(2).length) + 1n) / 2n);
  let next = (current + value / current) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}

export function exactSquareRoot(value: ExactNumber): ExactNumber | undefined {
  const [numerator, denominator] = parts(value);
  if (numerator < 0n) return undefined;
  const numeratorRoot = integerSquareRoot(numerator);
  const denominatorRoot = integerSquareRoot(denominator);
  return numeratorRoot * numeratorRoot === numerator &&
    denominatorRoot * denominatorRoot === denominator
    ? rational(numeratorRoot, denominatorRoot)
    : undefined;
}

export function isZero(value: ExactNumber): boolean {
  return parts(value)[0] === 0n;
}
export function isOne(value: ExactNumber): boolean {
  const [n, d] = parts(value);
  return n === d;
}
