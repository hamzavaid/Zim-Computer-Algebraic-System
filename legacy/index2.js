const { Add, Subtract, Multiply, Variable, Const, Divide, Power, Parser, Polynomial } = require('./util/old/Operations.js');
const { readFile } = require("node:fs/promises");
const { type } = require('node:os');
const { resolve } = require("node:path");

async function loadAlgebraQuestions(relativePath = "./algebra_questions.json") {
  // Resolve path relative to current module (so callers can `import` anywhere).
  const absolute = resolve(__dirname, relativePath);

  try {
    const raw = await readFile(absolute, "utf8");
    const data = JSON.parse(raw);

    // Basic sanity check
    if (!Array.isArray(data)) {
      throw new Error("JSON root must be an array.");
    }
    data.forEach(({ equation, solution }, i) => {
      if (typeof equation !== "string" || typeof solution !== "string") {
        throw new Error(`Item ${i} is malformed.`);
      }
    });

    return data;          // [{ equation: "x + 5 = 13", solution: "8" }, …]
  } catch (err) {
    console.error("Failed to load questions:", err.message);
    throw err;
  }
}

async function runAlgebraTest(relativePath = "./algebra_questions.json") {
  const questions = await loadAlgebraQuestions(relativePath);
  console.log(`Loaded ${questions.length} Algebra Questions`);

  let parser = new Parser();
  let wrong = [];

  for (const { equation, solution } of questions) {
    try {
      let expression = parser.parse(equation);
      let result = expression.solver("x").toString();
      if (solution != result) {
        wrong.push({ equation, expected: solution, got: result });
      }
    } catch (err) {
      console.error(`Error parsing equation "${equation}":`, err.message);
      wrong.push({ equation, expected: solution, got: "Error" });
    }
  }

  console.log(`Found ${wrong.length} wrong answers:`);
  for (const { equation, expected, got } of wrong) { 
    console.log(`Equation: ${equation}, Expected: ${expected}, Got: ${got}`);
  }
}

async function main() {
    let parser = new Parser();

    //await runAlgebraTest("./algebra_dataset.json");

    let expression = parser.parse("10 = 2 * x ^ 2 + 3 * x - 5");
    console.log("Parsed Expression:", expression.toString());
    console.log("Solved Expression: x =", expression.solve("x").toString());
}

main();