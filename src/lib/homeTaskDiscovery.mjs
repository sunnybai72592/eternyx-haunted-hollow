/**
 * Local, deterministic homepage task matching. No user query is sent to a server.
 * Tool entries come from the audited local registry; suggestions are not executions.
 */
const STOP_WORDS = new Set([
  "a", "an", "i", "my", "the", "to", "can", "you", "me", "please",
  "want", "make", "with", "how", "do", "help", "and", "in", "for",
  "is", "on", "something", "some", "that", "this", "would", "like"
]);

const INTENTS = [
  { words: new Set(["domain", "domains", "dns", "nameserver", "nameservers", "dmarc", "spf"]), choice: {
    name: "Check a domain’s DNS", route: "/cybersecurity/dns",
    detail: "Open DNS Analyzer to review public DNS records. Availability depends on backend configuration."
  }},
  { words: new Set(["video", "videos", "movie", "movies", "clip", "clips", "storyboard", "storyboards", "film", "films"]), choice: {
    name: "Open Video Studio", route: "/ai-arsenal/video",
    detail: "Plan shots and export a storyboard. Video rendering is currently unavailable."
  }},
  { words: new Set(["learn", "learning", "study", "studying", "course", "courses", "lesson", "lessons", "quiz", "quizzes", "education", "exam", "exams", "cbt"]), choice: {
    name: "Explore education", route: "/education"
  }}
];

const aliases = new Map([
  ["website", "web"], ["websites", "web"], ["apps", "app"],
  ["repos", "repository"], ["repositories", "repository"], ["coding", "code"],
  ["developer", "development"], ["developers", "development"],
  ["vulnerabilities", "vulnerability"], ["vulns", "vulnerability"],
  ["documents", "document"], ["notes", "note"],
  ["apis", "api"], ["jsons", "json"], ["sqls", "sql"],
  ["bugs", "bug"], ["errors", "error"], ["scanners", "scanner"],
  ["analyses", "analysis"], ["reports", "report"], ["files", "file"],
  ["workflows", "workflow"], ["databases", "database"],
  ["automations", "automation"], ["images", "image"],
  ["encrypting", "encrypt"], ["encryption", "encrypt"],
  ["decrypting", "decrypt"], ["decryption", "decrypt"]
]);

function tokens(value) {
  return [...new Set(
    String(value ?? "").toLowerCase().match(/[a-z0-9]+/g)?.map(word => aliases.get(word) ?? word)
      .filter(word => !STOP_WORDS.has(word)) ?? []
  )].slice(0, 32);
}

function validRoute(route) {
  return typeof route === "string" && /^\/(?!\/)[a-z0-9][a-z0-9/_-]*$/i.test(route);
}

/**
 * @param {string} input
 * @param {Array<{name:string,route:string,description?:string,access?:string,id?:string,pillar?:string}>} registry
 * @returns {Array<{name:string,route:string,detail?:string}>}
 */
export function findHomeTaskChoices(input, registry = []) {
  // Bound work independently of user input length and registry metadata size.
  const queryTerms = tokens(String(input ?? "").slice(0, 240)).slice(0, 16);
  if (!queryTerms.length) return [];

  const suggestions = [];
  const seen = new Set();
  for (const intent of INTENTS) {
    if (queryTerms.some(term => intent.words.has(term)) && validRoute(intent.choice.route)) {
      suggestions.push(intent.choice);
      seen.add(intent.choice.route);
    }
  }

  const scored = registry.map((tool, index) => {
    if (!tool || typeof tool.name !== "string" || !validRoute(tool.route) || seen.has(tool.route)) return null;
    const names = new Set(tokens(tool.name));
    const ids = new Set(tokens(tool.id));
    const details = new Set(tokens(tool.description));
    const categories = new Set(tokens(tool.pillar));
    const score = queryTerms.reduce((total, term) =>
      total + (names.has(term) ? 5 : 0) + (ids.has(term) ? 3 : 0) +
      (categories.has(term) ? 2 : 0) + (details.has(term) ? 1 : 0), 0);
    // Favor results covering the entire request when scores are otherwise tied.
    const coverage = queryTerms.filter(term => names.has(term) || ids.has(term) ||
      categories.has(term) || details.has(term)).length;
    return score ? { tool, score, coverage, index } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.index - b.index);

  for (const { tool } of scored) {
    if (suggestions.length >= 4) break;
    if (seen.has(tool.route)) continue;
    seen.add(tool.route);
    suggestions.push({
      name: tool.name,
      route: tool.route,
      detail: [tool.description, tool.access ? "Access: " + tool.access : null].filter(Boolean).join(" · ")
    });
  }
  return suggestions.slice(0, 4);
}
