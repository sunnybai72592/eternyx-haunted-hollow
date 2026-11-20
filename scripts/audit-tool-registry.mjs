import { readFileSync, statSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const tools = JSON.parse(read("src/data/toolRegistry.json"));
const router = read("src/App.tsx");
// The router declares each path as a literal. Fail visibly if that convention changes.
const routes = new Map();
for (const match of router.matchAll(/<Route\b/g)) {
  const declaration = router.slice(match.index).match(/^<Route\s+path="([^"]+)"\s+element=\{\s*<([\w.]+)/);
  if (!declaration) throw new Error("Review the new Route syntax before counting coverage.");
  const [, path, component] = declaration;
  if (routes.has(path)) throw new Error("Duplicate route: " + path);
  routes.set(path, component);
}

const entries = new Map();
for (const tool of tools) {
  if (!routes.has(tool.route) || routes.get(tool.route) === "Navigate") {
    throw new Error("Invalid tool destination: " + tool.route);
  }
  if (entries.has(tool.name)) throw new Error("Duplicate tool: " + tool.name);
  entries.set(tool.name, tool);
  for (const field of ["source", "test"]) {
    if (tool[field] !== null && !statSync(new URL(tool[field], root)).isFile()) {
      throw new Error("Invalid evidence path: " + tool[field]);
    }
  }
}

const indexed = new Set(tools.map(tool => tool.route));
for (const [path, component] of routes) {
  const classification = indexed.has(path) ? "indexed" : component === "Navigate" ? "redirect" : "unreviewed";
  console.log([classification, path, component].join("\t"));
}
console.log(`\n${routes.size} routes, ${tools.length} indexed tools across ${new Set(tools.map(tool => tool.pillar)).size} pillars.`);
