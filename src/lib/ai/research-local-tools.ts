/**
 * Browser-only research evidence notebook.
 * Sources, excerpts, and stance labels are entered by the user and NOT verified.
 * No network lookup, AI generation, storage, billing, or background execution.
 */
export const MAX_RESEARCH_SOURCES = 25;
export const MAX_RESEARCH_EVIDENCE = 100;
export const RESEARCH_STANCES = ["supports", "challenges", "context"] as const;
export type ResearchStance = (typeof RESEARCH_STANCES)[number];
export type ResearchMode = "research" | "summarize";

export interface ResearchSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly publisher?: string;
}
export interface ResearchEvidence {
  readonly id: string;
  readonly sourceId: string;
  readonly stance: ResearchStance;
  readonly claim: string;
  readonly excerpt?: string;
  readonly notes?: string;
}
export interface ResearchSourceInput {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly publisher?: string;
}
export interface ResearchEvidenceInput {
  readonly id: string;
  readonly sourceId: string;
  readonly stance: ResearchStance;
  readonly claim: string;
  readonly excerpt?: string;
  readonly notes?: string;
}
export interface ResearchDraft {
  readonly featureKey: "ai.research.search" | "ai.research.summarize";
  readonly mode: ResearchMode;
  readonly question: string;
  readonly localBrief: string;
}
export class LocalResearchError extends Error {
  readonly code: "invalid_id" | "invalid_source" | "invalid_url" | "duplicate_source" | "source_limit" |
    "invalid_evidence" | "duplicate_evidence" | "evidence_limit" | "missing_source" | "invalid_query" | "invalid_question";
  constructor(code: LocalResearchError["code"]) {
    super(code);
    this.name = "LocalResearchError";
    this.code = code;
  }
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
function bounded(value: unknown, max: number, required: boolean): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== "string" || value.length > max || value.includes("\u0000")) return null;
  const clean = value.trim();
  if (required && !clean) return null;
  return clean;
}
/** Accept HTTPS references only. This function never visits or verifies the URL. */
export function normalizeResearchUrl(raw: string): string {
  if (typeof raw !== "string" || raw.length > 2048 || !raw.trim()) throw new LocalResearchError("invalid_url");
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new LocalResearchError("invalid_url"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.href.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new LocalResearchError("invalid_url");
  }
  return url.href;
}
export function addResearchSource(existing: readonly ResearchSource[], input: ResearchSourceInput): ResearchSource[] {
  if (!validId(input?.id) || existing.some(source => source.id === input.id)) throw new LocalResearchError("invalid_id");
  if (existing.length >= MAX_RESEARCH_SOURCES) throw new LocalResearchError("source_limit");
  const title = bounded(input.title, 200, true);
  const publisher = bounded(input.publisher, 120, false);
  if (title === null || publisher === null && input.publisher !== undefined) throw new LocalResearchError("invalid_source");
  const url = normalizeResearchUrl(input.url);
  if (existing.some(source => source.url === url)) throw new LocalResearchError("duplicate_source");
  return [...existing, { id: input.id, title, url, ...(publisher ? { publisher } : {}) }];
}
export function addResearchEvidence(
  existing: readonly ResearchEvidence[],
  sources: readonly ResearchSource[],
  input: ResearchEvidenceInput,
): ResearchEvidence[] {
  if (!validId(input?.id) || existing.some(entry => entry.id === input.id)) throw new LocalResearchError("invalid_id");
  if (existing.length >= MAX_RESEARCH_EVIDENCE) throw new LocalResearchError("evidence_limit");
  if (!sources.some(source => source.id === input.sourceId)) throw new LocalResearchError("missing_source");
  if (!(RESEARCH_STANCES as readonly string[]).includes(input.stance)) throw new LocalResearchError("invalid_evidence");
  const claim = bounded(input.claim, 1000, true);
  const excerpt = bounded(input.excerpt, 2000, false);
  const notes = bounded(input.notes, 1000, false);
  if (claim === null || excerpt === null && input.excerpt !== undefined ||
      notes === null && input.notes !== undefined) throw new LocalResearchError("invalid_evidence");
  return [...existing, {
    id: input.id, sourceId: input.sourceId, stance: input.stance, claim,
    ...(excerpt ? { excerpt } : {}),
    ...(notes ? { notes } : {}),
  }];
}
export function removeResearchSource(
  sources: readonly ResearchSource[], evidence: readonly ResearchEvidence[], id: string,
): { sources: ResearchSource[]; evidence: ResearchEvidence[] } {
  return {
    sources: sources.filter(source => source.id !== id),
    evidence: evidence.filter(entry => entry.sourceId !== id),
  };
}
export function countResearchStances(evidence: readonly ResearchEvidence[]) {
  return {
    supports: evidence.filter(item => item.stance === "supports").length,
    challenges: evidence.filter(item => item.stance === "challenges").length,
    context: evidence.filter(item => item.stance === "context").length,
  };
}
/** Case-insensitive literal filtering of user-entered notes; never searches the web. */
export function filterResearchEvidence(
  sources: readonly ResearchSource[], evidence: readonly ResearchEvidence[], query: string,
): ResearchEvidence[] {
  if (typeof query !== "string" || query.length > 100) throw new LocalResearchError("invalid_query");
  const needle = query.trim().toLowerCase();
  if (!needle) return [...evidence];
  const sourceById = new Map(sources.map(source => [source.id, source]));
  return evidence.filter(item => {
    const source = sourceById.get(item.sourceId);
    return [item.claim, item.excerpt ?? "", item.notes ?? "", item.stance,
      source?.title ?? "", source?.publisher ?? "", source?.url ?? ""]
      .some(value => value.toLowerCase().includes(needle));
  });
}
function plainLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
/** Plain-text report; references are user claims, not independently verified citations. */
export function formatLocalResearchBrief(sources: readonly ResearchSource[], evidence: readonly ResearchEvidence[]): string {
  const sourceNumbers = new Map(sources.map((source, index) => [source.id, index + 1]));
  const counts = countResearchStances(evidence);
  const lines = [
    "ETERNYX LOCAL RESEARCH BRIEF",
    "User-entered references and excerpts only. ETERNYX has not visited or verified any source.",
    "The tags below reflect user categorization, not truth, source quality or research consensus.",
    "",
    "SOURCES (" + sources.length + ")",
    ...sources.map((source, index) =>
      "[" + (index + 1) + "] " + plainLine(source.title) + " — " + source.url +
      (source.publisher ? " — Publisher (user-entered): " + plainLine(source.publisher) : "")),
    "",
    "EVIDENCE (" + evidence.length + ")",
    "User tags: " + counts.supports + " supports / " + counts.challenges + " challenges / " + counts.context + " context.",
  ];
  for (const entry of evidence) {
    const number = sourceNumbers.get(entry.sourceId);
    if (!number) continue;
    lines.push(
      "",
      "[" + number + "] " + entry.stance.toUpperCase() + " — " + plainLine(entry.claim),
    );
    if (entry.excerpt) lines.push("User-entered excerpt (unverified): " + plainLine(entry.excerpt));
    if (entry.notes) lines.push("User notes: " + plainLine(entry.notes));
  }
  lines.push("", "No live web research, independent fact-checking, or AI synthesis was performed.");
  return lines.join("\n");
}
export function prepareResearchDraft(
  mode: ResearchMode, question: string,
  sources: readonly ResearchSource[], evidence: readonly ResearchEvidence[],
): ResearchDraft {
  if (mode !== "research" && mode !== "summarize") throw new LocalResearchError("invalid_question");
  const clean = bounded(question, 1000, true);
  if (clean === null) throw new LocalResearchError("invalid_question");
  return {
    featureKey: mode === "research" ? "ai.research.search" : "ai.research.summarize",
    mode, question: clean, localBrief: formatLocalResearchBrief(sources, evidence),
  };
}
export function formatResearchDraft(draft: ResearchDraft): string {
  return [
    draft.mode === "research"
      ? "Research this question using independently checked sources; distinguish facts, uncertainty, and disagreements."
      : "Summarize this user-provided research notebook without introducing unsupported facts.",
    "Question: " + draft.question,
    "BEGIN UNVERIFIED USER RESEARCH NOTES",
    draft.localBrief,
    "END UNVERIFIED USER RESEARCH NOTES",
  ].join("\n\n");
}
