const fs = require("node:fs");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const target = path.resolve(workspace, "packages/core/dist");

if (!target.startsWith(`${workspace}${path.sep}`)) {
  throw new Error("Refusing to clean a path outside the workspace");
}

fs.rmSync(target, { recursive: true, force: true });
