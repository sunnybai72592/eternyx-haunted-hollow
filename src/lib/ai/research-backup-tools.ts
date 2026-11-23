/**
 * Portable, opt-in, local-only research notebook backups and coverage review.
 * References and stance labels are user supplied and never fact-checked.
 * No network, storage, model invocation, execution or automatic persistence.
 */
import {
  MAX_RESEARCH_EVIDENCE, MAX_RESEARCH_SOURCES,
  addResearchEvidence, addResearchSource,
  type ResearchEvidence, type ResearchMode, type ResearchSource,
} from "./research-local-tools";

export const RESEARCH_BACKUP_FORMAT = "eternyx.research-notebook";
export const RESEARCH_BACKUP_VERSION = 1;
export const MAX_RESEARCH_BACKUP_BYTES = 512 * 1024;

export interface ResearchBackup {
  readonly format: typeof RESEARCH_BACKUP_FORMAT;
  readonly version: typeof RESEARCH_BACKUP_VERSION;
  readonly question: string;
  readonly mode: ResearchMode;
  readonly sources: readonly ResearchSource[];
  readonly evidence: readonly ResearchEvidence[];
}
export interface ResearchSourceCoverage {
  readonly sourceId: string;
  readonly title: string;
  readonly evidenceCount: number;
  readonly supports: number;
  readonly challenges: number;
  readonly context: number;
}
export interface ResearchTagDisagreement {
  readonly claim: string;
  readonly supportingSources: number;
  readonly challengingSources: number;
}
export interface ResearchCoverage {
  readonly totalSources: number;
  readonly totalEvidence: number;
  readonly sourcesWithEvidence: number;
  readonly sourcesWithoutEvidence: number;
  readonly perSource: readonly ResearchSourceCoverage[];
  readonly tagDisagreements: readonly ResearchTagDisagreement[];
  readonly caveat: string;
}
export class ResearchBackupError extends Error {
  readonly code: "invalid_file" | "too_large" | "invalid_json" | "invalid_schema" | "invalid_source" | "invalid_evidence";
  constructor(code: ResearchBackupError["code"]) {
    super(code);
    this.name = "ResearchBackupError";
    this.code = code;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(input: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  return Object.keys(input).every(key => allowed.includes(key)) &&
    required.every(key => Object.prototype.hasOwnProperty.call(input, key));
}
function validatedSnapshot(
  candidate: unknown,
): ResearchBackup {
  if (!record(candidate) || !exactKeys(candidate,
    ["format", "version", "question", "mode", "sources", "evidence"],
    ["format", "version", "question", "mode", "sources", "evidence"]) ||
    candidate.format !== RESEARCH_BACKUP_FORMAT || candidate.version !== RESEARCH_BACKUP_VERSION ||
    (candidate.mode !== "research" && candidate.mode !== "summarize") ||
    typeof candidate.question !== "string" || candidate.question.length > 1000 ||
    candidate.question.includes("\u0000") ||
    !Array.isArray(candidate.sources) || !Array.isArray(candidate.evidence) ||
    candidate.sources.length > MAX_RESEARCH_SOURCES || candidate.evidence.length > MAX_RESEARCH_EVIDENCE) {
    throw new ResearchBackupError("invalid_schema");
  }
  let sources: ResearchSource[] = [];
  for (const item of candidate.sources) {
    if (!record(item) ||
      !exactKeys(item, ["id", "title", "url", "publisher"], ["id", "title", "url"]) ||
      typeof item.id !== "string" || typeof item.title !== "string" ||
      typeof item.url !== "string" ||
      (item.publisher !== undefined && typeof item.publisher !== "string")) {
      throw new ResearchBackupError("invalid_source");
    }
    try {
      sources = addResearchSource(sources, {
        id: item.id, title: item.title, url: item.url,
        ...(item.publisher === undefined ? {} : { publisher: item.publisher }),
      });
    } catch { throw new ResearchBackupError("invalid_source"); }
  }
  let evidence: ResearchEvidence[] = [];
  for (const item of candidate.evidence) {
    if (!record(item) ||
      !exactKeys(item, ["id", "sourceId", "stance", "claim", "excerpt", "notes"],
        ["id", "sourceId", "stance", "claim"]) ||
      typeof item.id !== "string" || typeof item.sourceId !== "string" ||
      typeof item.stance !== "string" || typeof item.claim !== "string" ||
      (item.excerpt !== undefined && typeof item.excerpt !== "string") ||
      (item.notes !== undefined && typeof item.notes !== "string")) {
      throw new ResearchBackupError("invalid_evidence");
    }
    try {
      evidence = addResearchEvidence(evidence, sources, {
        id: item.id, sourceId: item.sourceId,
        stance: item.stance as ResearchEvidence["stance"], claim: item.claim,
        ...(item.excerpt === undefined ? {} : { excerpt: item.excerpt }),
        ...(item.notes === undefined ? {} : { notes: item.notes }),
      });
    } catch { throw new ResearchBackupError("invalid_evidence"); }
  }
  return {
    format: RESEARCH_BACKUP_FORMAT, version: RESEARCH_BACKUP_VERSION,
    question: candidate.question, mode: candidate.mode as ResearchMode,
    sources, evidence,
  };
}
export function serializeResearchBackup(input: {
  sources: readonly ResearchSource[];
  evidence: readonly ResearchEvidence[];
  question: string;
  mode: ResearchMode;
}): string {
  // Revalidate data that could have been edited before choosing export.
  const result = validatedSnapshot({
    format: RESEARCH_BACKUP_FORMAT, version: RESEARCH_BACKUP_VERSION,
    question: input.question, mode: input.mode,
    sources: input.sources, evidence: input.evidence,
  });
  const json = JSON.stringify(result, null, 2) + "\n";
  if (new TextEncoder().encode(json).byteLength > MAX_RESEARCH_BACKUP_BYTES) {
    throw new ResearchBackupError("too_large");
  }
  return json;
}
export function parseResearchBackup(text: string): ResearchBackup {
  if (typeof text !== "string" || !text.trim()) throw new ResearchBackupError("invalid_json");
  if (new TextEncoder().encode(text).byteLength > MAX_RESEARCH_BACKUP_BYTES) {
    throw new ResearchBackupError("too_large");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new ResearchBackupError("invalid_json"); }
  return validatedSnapshot(parsed);
}
export async function readResearchBackupFile(
  file: Pick<File, "name" | "size" | "type" | "text">,
): Promise<ResearchBackup> {
  if (!file || typeof file.name !== "string" || !file.name.toLowerCase().endsWith(".json") ||
      typeof file.text !== "function" || !Number.isSafeInteger(file.size) ||
      file.size <= 0 || file.size > MAX_RESEARCH_BACKUP_BYTES ||
      (file.type && !["application/json", "text/plain", "application/octet-stream"].includes(file.type))) {
    throw new ResearchBackupError("invalid_file");
  }
  let text: string;
  try { text = await file.text(); }
  catch { throw new ResearchBackupError("invalid_file"); }
  return parseResearchBackup(text);
}
export function assessResearchCoverage(
  sources: readonly ResearchSource[], evidence: readonly ResearchEvidence[],
): ResearchCoverage {
  const perSource = sources.map(source => {
    const linked = evidence.filter(item => item.sourceId === source.id);
    return {
      sourceId: source.id, title: source.title,
      evidenceCount: linked.length,
      supports: linked.filter(item => item.stance === "supports").length,
      challenges: linked.filter(item => item.stance === "challenges").length,
      context: linked.filter(item => item.stance === "context").length,
    };
  });
  const groups = new Map<string, { claim: string; supports: Set<string>; challenges: Set<string> }>();
  for (const entry of evidence) {
    if (!sources.some(source => source.id === entry.sourceId)) continue;
    // Exact normalized user-entered claim, not semantic similarity.
    const normalized = entry.claim.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    if (!normalized) continue;
    let item = groups.get(normalized);
    if (!item) {
      item = { claim: entry.claim.replace(/\s+/gu, " ").trim(), supports: new Set(), challenges: new Set() };
      groups.set(normalized, item);
    }
    if (entry.stance === "supports") item.supports.add(entry.sourceId);
    if (entry.stance === "challenges") item.challenges.add(entry.sourceId);
  }
  const tagDisagreements = [...groups.values()]
    .filter(group => group.supports.size > 0 && group.challenges.size > 0)
    .map(group => ({
      claim: group.claim,
      supportingSources: group.supports.size,
      challengingSources: group.challenges.size,
    }));
  const sourcesWithEvidence = perSource.filter(item => item.evidenceCount > 0).length;
  return {
    totalSources: sources.length, totalEvidence: evidence.length,
    sourcesWithEvidence, sourcesWithoutEvidence: sources.length - sourcesWithEvidence,
    perSource, tagDisagreements,
    caveat: "Coverage is a count of unverified, user-entered notes. Opposing stance tags on identically worded claims indicate a review candidate, not an independently established contradiction or source-quality judgment.",
  };
}
export function formatResearchCoverage(coverage: ResearchCoverage): string {
  return [
    "ETERNYX LOCAL RESEARCH COVERAGE — user-supplied notes only",
    coverage.caveat,
    "Sources: " + coverage.totalSources,
    "Evidence notes: " + coverage.totalEvidence,
    "Sources with evidence: " + coverage.sourcesWithEvidence,
    "Sources without evidence: " + coverage.sourcesWithoutEvidence,
    "",
    ...coverage.perSource.map(item =>
      item.title.replace(/\s+/gu, " ").trim() + ": " + item.evidenceCount + " notes (" +
      item.supports + " supports / " + item.challenges + " challenges / " +
      item.context + " context)"),
    "",
    "Identically worded claims with opposing USER tags: " + coverage.tagDisagreements.length,
    ...coverage.tagDisagreements.map(item =>
      item.claim + " — " + item.supportingSources + " supporting-source tags; " +
      item.challengingSources + " challenging-source tags"),
    "No URLs were opened or verified. No independent AI research or fact-checking was performed.",
  ].join("\n");
}
