/**
 * Bounded lexical retrieval for authenticated, owner-checked document chunks.
 * It is not semantic RAG, OCR, or independently verified citations.
 */
export interface RankedDocumentChunk {
  readonly content: string;
  readonly chunk_index: number;
}
export interface DocumentEvidence {
  readonly segment: number; // one-based index in the owner's document_chunks table
  readonly excerpt: string; // exact substring of a retrieved chunk, not model-generated
}
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "when",
  "where", "how", "why", "are", "was", "were", "can", "you", "your",
  "about", "into", "does", "their", "there", "of", "is", "it", "to",
  "be", "by", "on", "at", "as", "in", "or", "an", "we", "do",
]);
const WORDS = /[\p{L}\p{N}]+/gu;
const MAX_EVIDENCE_EXCERPT = 700;

/** Supports two-letter technical acronyms such as CP, IR and pH. */
export function getDocumentQueryTerms(question: string): string[] {
  const words = typeof question === "string"
    ? question.toLocaleLowerCase().match(WORDS) ?? [] : [];
  return [...new Set(words.filter(word => word.length >= 2 && !STOP_WORDS.has(word)))].slice(0, 20);
}

function scoreContext(questionTerms: readonly string[], content: string): number {
  const textWords = content.toLocaleLowerCase().match(WORDS) ?? [];
  const bag = new Set(textWords);
  let score = 0;
  for (const word of questionTerms) {
    if (bag.has(word)) score += 10; // whole words, never substring-only matches
  }
  // Prefer sections mentioning adjacent question concepts together.
  for (let i = 0; i < questionTerms.length - 1; i++) {
    const left = questionTerms[i], right = questionTerms[i + 1];
    for (let j = 0; j < textWords.length - 1; j++) {
      if (textWords[j] === left && textWords[j + 1] === right) {
        score += 3;
        break;
      }
    }
  }
  return score;
}

/** Deterministic ranking with index-based tie breaking. */
export function rankDocumentContext(
  question: string,
  chunks: readonly RankedDocumentChunk[],
  limit = 5,
): RankedDocumentChunk[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error("Invalid document context limit");
  }
  const terms = getDocumentQueryTerms(question);
  if (!terms.length) return [];
  const scored = chunks
    .filter(chunk => chunk && typeof chunk.content === "string" &&
      Number.isSafeInteger(chunk.chunk_index) && chunk.chunk_index >= 0 &&
      chunk.content.length <= 2000)
    .map(chunk => ({ chunk, score: scoreContext(terms, chunk.content) }))
    .filter(item => item.score > 0);
  scored.sort((a, b) => b.score - a.score || a.chunk.chunk_index - b.chunk.chunk_index);
  return scored.slice(0, limit).map(item => item.chunk);
}

/** Source excerpts are sliced from actual returned chunks, never fabricated by AI. */
export function buildDocumentEvidence(
  ranked: readonly RankedDocumentChunk[],
): DocumentEvidence[] {
  return ranked.slice(0, 5)
    .filter(item => item && Number.isSafeInteger(item.chunk_index) &&
      item.chunk_index >= 0 && typeof item.content === "string")
    .map(item => ({
      segment: item.chunk_index + 1,
      excerpt: item.content.slice(0, MAX_EVIDENCE_EXCERPT),
    }));
}

export function formatDocumentEvidenceForPrompt(evidence: readonly DocumentEvidence[]): string {
  return evidence.map(item =>
    "[Document segment " + item.segment + "]\n" + item.excerpt,
  ).join("\n\n");
}
