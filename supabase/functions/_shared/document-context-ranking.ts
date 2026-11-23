/**
 * Bounded lexical relevance selection for existing document text chunks.
 * This is not vector search, semantic embeddings, PDF parsing or a citation verifier.
 * The caller must authenticate the document owner before requesting chunks.
 */
export interface RankedDocumentChunk {
  readonly content: string;
  readonly chunk_index: number;
}
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "how", "why", "are", "was", "were", "can", "you", "your", "about", "into", "does", "their", "there"]);

export function getDocumentQueryTerms(question: string): string[] {
  const words = typeof question === "string"
    ? question.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
    : [];
  return [...new Set(words.filter(word => !STOP_WORDS.has(word)))].slice(0, 20);
}

/**
 * Choose up to `limit` chunks that contain question terms, breaking ties
 * deterministically by original index. No irrelevant chunk is passed to AI
 * if none of the bounded candidate chunks match.
 */
export function rankDocumentContext(
  question: string,
  chunks: readonly RankedDocumentChunk[],
  limit = 5,
): RankedDocumentChunk[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Invalid document context limit");
  const terms = getDocumentQueryTerms(question);
  if (!terms.length) return [];
  return chunks
    .filter(chunk => chunk && typeof chunk.content === "string" &&
      Number.isInteger(chunk.chunk_index) && chunk.content.length <= 2000)
    .map(chunk => {
      const text = chunk.content.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.chunk_index - b.chunk.chunk_index)
    .slice(0, limit)
    .map(item => item.chunk);
}
