const { readdirSync, statSync } = require("fs");
const { join, relative } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const ignored = new Set(["node_modules", ".git"]);

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

for (const file of files(root)) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${relative(root, file)}\n`);
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
console.log("All JavaScript files passed syntax checks.");
