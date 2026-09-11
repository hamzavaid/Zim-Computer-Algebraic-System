const fs = require("node:fs");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const targets = ["packages/core/dist", "packages/cli/dist", "packages/gui/dist"].map(
  (relativePath) => path.resolve(workspace, relativePath),
);

for (const target of targets) {
  if (!target.startsWith(`${workspace}${path.sep}`)) {
    throw new Error("Refusing to clean a path outside the workspace");
  }
  fs.rmSync(target, { recursive: true, force: true });
}
