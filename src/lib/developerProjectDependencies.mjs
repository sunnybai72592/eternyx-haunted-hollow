import { normalizeDeveloperProject } from "./developerProjectLab.mjs";
import { listDeveloperProjectReferences } from "./developerProjectIntegration.mjs";

export const DEVELOPER_DEPENDENCY_REPORT_SCHEMA = "eternyx-developer-dependencies-v1";

const ordered = names => [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));

function fileGraph(project) {
  const references = listDeveloperProjectReferences(project);
  const files = project.files.map(file => file.name);
  const edges = references.filter(reference => reference.reason === "resolved" && reference.to !== null);
  const incoming = new Map(files.map(file => [file, 0]));
  const outgoing = new Map(files.map(file => [file, 0]));
  for (const edge of edges) {
    outgoing.set(edge.from, outgoing.get(edge.from) + 1);
    incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  return {
    references,
    edges,
    files: files.map(name => ({ name, inbound: incoming.get(name), outbound: outgoing.get(name) })),
    // This means 'no inbound edges in the limited static scan', not 'unused'.
    unreferenced: ordered(files.filter(name => name.toLowerCase() !== "index.html" && incoming.get(name) === 0)),
  };
}

function cyclicComponents(files, edges, kind) {
  const vertices = ordered(files.filter(name => name.toLowerCase().endsWith(kind === "js" ? ".js" : ".css")));
  const adjacency = new Map(vertices.map(name => [name, new Set()]));
  const validKind = kind === "js" ? "js-local-imports-resolve" : "css-local-files-resolve";
  for (const edge of edges) {
    if (edge.kind === validKind && adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).add(edge.to);
    }
  }
  const indices = new Map(), lows = new Map(), stack = [], active = new Set(), cycles = [];
  let index = 0;
  function visit(name) {
    indices.set(name, index);
    lows.set(name, index++);
    stack.push(name); active.add(name);
    for (const next of ordered(adjacency.get(name))) {
      if (!indices.has(next)) { visit(next); lows.set(name, Math.min(lows.get(name), lows.get(next))); }
      else if (active.has(next)) lows.set(name, Math.min(lows.get(name), indices.get(next)));
    }
    if (lows.get(name) === indices.get(name)) {
      const group = [];
      let item;
      do {
        item = stack.pop();
        active.delete(item);
        group.push(item);
      } while (item !== name);
      if (group.length > 1 || adjacency.get(name).has(name)) cycles.push({ kind, files: ordered(group) });
    }
  }
  for (const file of vertices) if (!indices.has(file)) visit(file);
  return cycles;
}

function changeImpact(current, baseline, currentGraph) {
  if (baseline === null) return null;
  const before = normalizeDeveloperProject(baseline);
  const oldFiles = new Map(before.files.map(f => [f.name.toLowerCase(), f]));
  const newFiles = new Map(current.files.map(f => [f.name.toLowerCase(), f]));
  const changed = new Set();
  for (const file of current.files) {
    const previous = oldFiles.get(file.name.toLowerCase());
    if (!previous || previous.content !== file.content || previous.name !== file.name) changed.add(file.name);
  }
  for (const file of before.files) if (!newFiles.has(file.name.toLowerCase())) changed.add(file.name);
  const reverse = new Map();
  for (const edge of [...currentGraph.edges, ...fileGraph(before).edges]) {
    const target = edge.to.toLowerCase();
    if (!reverse.has(target)) reverse.set(target, new Set());
    reverse.get(target).add(edge.from);
  }
  const queue = [...changed];
  const visited = new Set(queue.map(name => name.toLowerCase()));
  const affected = new Set();
  while (queue.length) {
    const currentName = queue.shift();
    for (const dependent of reverse.get(currentName.toLowerCase()) || []) {
      const key = dependent.toLowerCase();
      if (visited.has(key)) continue;
      visited.add(key);
      if (newFiles.has(key)) affected.add(newFiles.get(key).name);
      queue.push(dependent);
    }
  }
  return { changed: ordered(changed), affected: ordered(affected) };
}

/**
 * Browser-local, source-derived topology. No runtime resource resolution,
 * module execution, web access or remote writes. Bounded by 12 project files.
 * File names and edges are kept in this in-memory result for editor navigation.
 */
export function analyzeDeveloperProjectDependencies(project, baseline = null) {
  const current = normalizeDeveloperProject(project);
  const graph = fileGraph(current);
  const cycles = [
    ...cyclicComponents(current.files.map(f => f.name), graph.edges, "css"),
    ...cyclicComponents(current.files.map(f => f.name), graph.edges, "js"),
  ];
  const kindCounts = {};
  for (const kind of ["html-local-files-resolve", "css-local-files-resolve", "js-local-imports-resolve"]) {
    const subset = graph.references.filter(ref => ref.kind === kind);
    kindCounts[kind] = {
      checked: subset.length,
      matched: subset.filter(ref => ref.reason === "resolved").length,
      unresolved: subset.filter(ref => ref.reason !== "resolved").length,
    };
  }
  return {
    fileCount: current.files.length,
    referenceCount: graph.references.length,
    matchedCount: graph.edges.length,
    unresolvedCount: graph.references.length - graph.edges.length,
    files: graph.files, references: graph.references,
    unreferenced: graph.unreferenced, cycles, kindCounts,
    impact: changeImpact(current, baseline, graph),
  };
}

/** Source-free and filename-free evidence. Caller-provided report objects are never trusted. */
export function exportDeveloperDependencyReport(project, baseline = null) {
  const report = analyzeDeveloperProjectDependencies(project, baseline);
  return JSON.stringify({
    schema: DEVELOPER_DEPENDENCY_REPORT_SCHEMA,
    createdAt: new Date().toISOString(),
    scope: "Browser-local heuristic file-reference topology only. No runtime, deployment, security or hosted integration proof.",
    fileCount: report.fileCount,
    referenceCount: report.referenceCount,
    matchedCount: report.matchedCount,
    unresolvedCount: report.unresolvedCount,
    unreferencedCount: report.unreferenced.length,
    cycleCount: report.cycles.length,
    cycleKinds: {
      css: report.cycles.filter(c => c.kind === "css").length,
      js: report.cycles.filter(c => c.kind === "js").length,
    },
    kindCounts: report.kindCounts,
    impact: report.impact ? { changedCount: report.impact.changed.length, affectedCount: report.impact.affected.length } : null,
  }, null, 2);
}
