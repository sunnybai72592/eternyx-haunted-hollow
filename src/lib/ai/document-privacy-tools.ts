/**
 * ETERNYX Document Privacy Guard: local, deterministic pattern matches.
 * This is NOT comprehensive PII/DLP scanning and does not verify secrets.
 * All positions and values are derived from the current text only.
 */
export const MAX_PRIVACY_SOURCE_CHARS = 100000;
export const MAX_PRIVACY_FINDINGS = 250;
export type PrivacyKind = "credential" | "bearer" | "jwt" | "payment_card" | "email" | "international_phone";
export interface PrivacyFinding {
  readonly kind: PrivacyKind;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
  readonly characters: number;
}
export interface PrivacyResult {
  readonly findings: readonly PrivacyFinding[];
  readonly counts: Readonly<Record<PrivacyKind, number>>;
  readonly scannedCharacters: number;
  readonly note: string;
}
export interface PrivacyRedaction {
  readonly text: string;
  readonly report: PrivacyResult;
  readonly replacedCharacters: number;
}
export class DocumentPrivacyError extends Error {
  readonly code: "invalid_text" | "too_large" | "too_many_findings";
  constructor(code: DocumentPrivacyError["code"]) {
    super(code);
    this.name = "DocumentPrivacyError";
    this.code = code;
  }
}
const KINDS: readonly PrivacyKind[] = [
  "credential", "bearer", "jwt", "payment_card", "email", "international_phone",
] as const;
const LABELS: Record<PrivacyKind, string> = {
  credential: "CREDENTIAL_VALUE", bearer: "BEARER_TOKEN", jwt: "JWT_LIKE_TOKEN",
  payment_card: "PAYMENT_CARD_LIKE_NUMBER", email: "EMAIL", international_phone: "INTERNATIONAL_PHONE",
};
type Candidate = { kind: PrivacyKind; start: number; end: number; priority: number };
function validate(text: string): void {
  if (typeof text !== "string" || !text.trim() || text.includes("\u0000")) {
    throw new DocumentPrivacyError("invalid_text");
  }
  if (text.length > MAX_PRIVACY_SOURCE_CHARS) throw new DocumentPrivacyError("too_large");
}
function luhn(value: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0, doubleNext = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (doubleNext) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    doubleNext = !doubleNext;
  }
  return sum % 10 === 0;
}
function positions(text: string, start: number) {
  let line = 1, column = 1;
  for (let i = 0; i < start; i++) {
    if (text[i] === "\n") { line++; column = 1; }
    else column++;
  }
  return { line, column };
}
export function inspectDocumentPrivacy(text: string): PrivacyResult {
  validate(text);
  const candidates: Candidate[] = [];
  const add = (kind: PrivacyKind, start: number, end: number, priority: number) => {
    if (start < 0 || end <= start || end > text.length) return;
    candidates.push({ kind, start, end, priority });
    // Do not return partial coverage when there are too many matches.
    if (candidates.length > MAX_PRIVACY_FINDINGS * 4) {
      throw new DocumentPrivacyError("too_many_findings");
    }
  };
  const patterns: Array<{
    kind: PrivacyKind; regex: RegExp; priority: number;
    group?: number; valid?: (match: string) => boolean;
  }> = [
    {
      kind: "credential", priority: 60, group: 1,
      // Examples: api_key="...", password: value, access_token=value.
      // This rule intentionally masks only the assigned value, not its key.
      regex: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|secret[_-]?key|password|private[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9._~+\/=-]{8,240})["']?/gi,
    },
    {
      kind: "bearer", priority: 50, group: 1,
      regex: /\bBearer[ \t]+([A-Za-z0-9._~+\/=-]{16,512})/gi,
    },
    {
      kind: "jwt", priority: 40,
      regex: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    },
    {
      kind: "payment_card", priority: 30,
      regex: /\b(?:\d[ -]?){12,18}\d\b/g,
      valid: luhn,
    },
    {
      kind: "email", priority: 20,
      regex: /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,190}\.[A-Z]{2,24}\b/gi,
    },
    {
      kind: "international_phone", priority: 10,
      regex: /\+[1-9]\d[\d() .-]{7,24}\d\b/g,
      valid: match => {
        const digits = match.replace(/\D/g, "");
        return digits.length >= 9 && digits.length <= 15;
      },
    },
  ];
  for (const {kind, regex, priority, group, valid} of patterns) {
    for (const match of text.matchAll(regex)) {
      const piece = group ? match[group] : match[0];
      if (!piece || (valid && !valid(piece))) continue;
      const index = group
        ? match.index! + match[0].indexOf(piece)
        : match.index!;
      add(kind, index, index + piece.length, priority);
    }
  }
  // Higher-priority matches own overlaps (credential vs JWT / bearer).
  candidates.sort((a, b) => b.priority - a.priority || a.start - b.start || b.end - a.end);
  const chosen: Candidate[] = [];
  for (const item of candidates) {
    if (chosen.some(x => item.start < x.end && x.start < item.end)) continue;
    chosen.push(item);
    if (chosen.length > MAX_PRIVACY_FINDINGS) throw new DocumentPrivacyError("too_many_findings");
  }
  chosen.sort((a, b) => a.start - b.start || a.end - b.end);
  const counts = Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<PrivacyKind, number>;
  const findings = chosen.map(({kind, start, end}): PrivacyFinding => {
    counts[kind]++;
    return {kind, start, end, ...positions(text, start), characters: end - start};
  });
  return {
    findings, counts, scannedCharacters: text.length,
    note: "Heuristic matches only. Unknown formats, partial tokens, names, addresses and other sensitive content may be missed. Always inspect the redacted text manually.",
  };
}
export function redactDocumentPrivacy(text: string): PrivacyRedaction {
  const report = inspectDocumentPrivacy(text);
  let cursor = 0;
  let redacted = "";
  let replacedCharacters = 0;
  for (const match of report.findings) {
    redacted += text.slice(cursor, match.start) + "[REDACTED_" + LABELS[match.kind] + "]";
    replacedCharacters += match.end - match.start;
    cursor = match.end;
  }
  redacted += text.slice(cursor);
  return {text: redacted, report, replacedCharacters};
}
export function formatDocumentPrivacyAudit(report: PrivacyResult): string {
  const lines = [
    "ETERNYX local document privacy pattern report",
    "Heuristic only; no guarantee all private information was found.",
    "Scanned characters: " + report.scannedCharacters,
    "Findings: " + report.findings.length,
    ...KINDS.map(kind => kind + ": " + report.counts[kind]),
    "Locations (never includes matched source values):",
    ...report.findings.map(f => f.kind + " at line " + f.line + ", column " + f.column +
      " (" + f.characters + " characters)"),
    report.note,
  ];
  return lines.join("\n");
}
