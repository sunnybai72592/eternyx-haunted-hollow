import { useMemo, useRef, useState } from "react";
import { useAIStudioChat } from "@/hooks/useAIStudioChat";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileCheck2, FileSearch, RotateCcw, ScanSearch, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeaturesForStudio } from "@/lib/ai/registry";
import {
  MAX_COMPARISON_AI_CHANGES, MAX_COMPARISON_LINES,
  DocumentCompareError, compareLocalDocuments,
  formatDocumentComparison, prepareDocumentComparisonAIRequest,
  type DocumentComparison,
} from "@/lib/ai/document-compare-tools";
import {
  MAX_STRUCTURED_AI_CHANGES, StructuredCompareError,
  compareStructuredJson, compareStructuredCsv,
  formatStructuredComparison, prepareStructuredComparisonAIRequest,
  type StructuredComparison,
} from "@/lib/ai/document-structured-compare";
import {
  DocumentPrivacyError, redactDocumentPrivacy, inspectDocumentPrivacy,
  formatDocumentPrivacyAudit, type PrivacyRedaction,
} from "@/lib/ai/document-privacy-tools";
import {
  MAX_CORPUS_FILES, MAX_CORPUS_PREVIEW, MAX_CORPUS_AI_EVIDENCE,
  CorpusSearchError, addCorpusDocuments, searchCorpus,
  formatCorpusSearch, prepareCorpusAIRequest,
  type CorpusDocument, type CorpusMatchMode, type CorpusSearch,
} from "@/lib/ai/document-corpus-tools";
import {
  CorpusReviewError,
  getCorpusSourceContext, verifyCurrentCorpusHit,
  summarizeCorpusCoverage, formatCorpusCoverage, formatSelectedCorpusContext,
  fingerprintCorpusDecodedText, formatCorpusFingerprints,
  type CorpusContext, type CorpusTextFingerprint,
} from "@/lib/ai/document-corpus-review";
import {
  MAX_CORPUS_WORKSPACE_BYTES, CorpusWorkspaceError,
  exportCorpusWorkspace, readCorpusWorkspaceFile,
  formatCorpusWorkspaceInventory, type CorpusWorkspace,
} from "@/lib/ai/document-corpus-workspace";
import {
  ENCRYPTED_CORPUS_ITERATIONS, MAX_ENCRYPTED_CORPUS_BYTES,
  MIN_ENCRYPTED_CORPUS_PASSWORD, MAX_ENCRYPTED_CORPUS_PASSWORD,
  EncryptedCorpusError, encryptCorpusWorkspace, readEncryptedCorpusFile,
  rotateEncryptedCorpusFile,
} from "@/lib/ai/document-corpus-crypto";
import {
  compareCorpusImport, formatPrivateCorpusImportReview,
} from "@/lib/ai/document-corpus-import-review";
import {
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARACTERS,
  LocalDocumentError,
  findDocumentMatches,
  formatDocumentDraft,
  inspectLocalDocument,
  prepareDocumentDraft,
  readLocalDocument,
  type DocumentSearchResults,
  type LocalDocumentInspection,
  type LocalDocumentKind,
  type LocalDocumentDraft,
  type LocalDocumentTask,
} from "@/lib/ai/document-local-tools";

const features = getFeaturesForStudio("documents");
const AIDocumentIntelligence = () => {
  const [kind, setKind] = useState<LocalDocumentKind>("txt");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inspection, setInspection] = useState<LocalDocumentInspection | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchResults, setSearchResults] = useState<DocumentSearchResults | null>(null);
  const [task, setTask] = useState<LocalDocumentTask>("analyze");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<LocalDocumentDraft | null>(null);
  const [aiPassage, setAiPassage] = useState<string | null>(null);
  const ai = useAIStudioChat();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceField = useRef<HTMLTextAreaElement>(null);
  const fileReadVersion = useRef(0);
  const comparisonReadVersion = useRef(0);
  const [comparisonSource, setComparisonSource] = useState("");
  const [comparisonFileName, setComparisonFileName] = useState<string | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonIgnoreWhitespace, setComparisonIgnoreWhitespace] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"line" | "json" | "csv">("line");
  const [comparisonCsvKey, setComparisonCsvKey] = useState("");
  const [structuredComparison, setStructuredComparison] = useState<StructuredComparison | null>(null);
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);
  const [comparisonQuestion, setComparisonQuestion] = useState("");
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const comparisonAI = useAIStudioChat();
  const [privacyCopy, setPrivacyCopy] = useState<(PrivacyRedaction & {sourceText: string}) | null>(null);
  const [privacyUseForAI, setPrivacyUseForAI] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);
  const privacyTarget = aiPassage ?? source;
  const privacyCurrent = privacyCopy?.sourceText === privacyTarget ? privacyCopy : null;
  const corpusReadVersion = useRef(0);
  const [corpusFiles, setCorpusFiles] = useState<CorpusDocument[]>([]);
  const [corpusBusy, setCorpusBusy] = useState(false);
  const [corpusQuery, setCorpusQuery] = useState("");
  const [corpusMode, setCorpusMode] = useState<CorpusMatchMode>("all");
  const [corpusFilter, setCorpusFilter] = useState("");
  const [corpusResults, setCorpusResults] = useState<CorpusSearch | null>(null);
  const [corpusSelectedIds, setCorpusSelectedIds] = useState<string[]>([]);
  const [corpusQuestion, setCorpusQuestion] = useState("");
  const [corpusError, setCorpusError] = useState<string | null>(null);
  const [corpusNotice, setCorpusNotice] = useState<string | null>(null);
  const corpusAI = useAIStudioChat();
  const corpusCharacters = corpusFiles.reduce((sum, doc) => sum + doc.text.length, 0);
  const corpusCoverage = corpusResults ? summarizeCorpusCoverage(corpusFiles, corpusResults) : null;
  const corpusHashVersion = useRef(0);
  const [corpusFingerprints, setCorpusFingerprints] = useState<readonly CorpusTextFingerprint[] | null>(null);
  const [corpusHashBusy, setCorpusHashBusy] = useState(false);
  const [corpusContext, setCorpusContext] = useState<CorpusContext | null>(null);
  const corpusWorkspaceEpoch = useRef(0);
  const [corpusWorkspaceLoading, setCorpusWorkspaceLoading] = useState(false);
  const [corpusWorkspaceExporting, setCorpusWorkspaceExporting] = useState(false);
  const [pendingCorpusWorkspace, setPendingCorpusWorkspace] = useState<CorpusWorkspace | null>(null);
  const [corpusWorkspaceError, setCorpusWorkspaceError] = useState<string | null>(null);
  const [corpusWorkspaceNotice, setCorpusWorkspaceNotice] = useState<string | null>(null);
  const [encryptedExportPassword, setEncryptedExportPassword] = useState("");
  const [encryptedExportConfirm, setEncryptedExportConfirm] = useState("");
  const [encryptedImportPassword, setEncryptedImportPassword] = useState("");
  const [pendingCorpusEncrypted, setPendingCorpusEncrypted] = useState(false);
  const [rotateOldPassword, setRotateOldPassword] = useState("");
  const [rotateNewPassword, setRotateNewPassword] = useState("");
  const [rotateConfirmPassword, setRotateConfirmPassword] = useState("");
  const pendingCorpusReview = useMemo(
    () => pendingCorpusWorkspace ? compareCorpusImport({
      documents:corpusFiles, query:corpusQuery, mode:corpusMode,
      sourceFilter:corpusFilter || null, question:corpusQuestion,
    },pendingCorpusWorkspace) : null,
    [corpusFiles,corpusQuery,corpusMode,corpusFilter,corpusQuestion,pendingCorpusWorkspace],
  );
  const invalidateCorpusWorkspace = () => {
    corpusWorkspaceEpoch.current += 1;
    setPendingCorpusWorkspace(null);
    setPendingCorpusEncrypted(false);
    setEncryptedExportPassword("");
    setEncryptedExportConfirm("");
    setEncryptedImportPassword("");
    setRotateOldPassword("");
    setRotateNewPassword("");
    setRotateConfirmPassword("");
    setCorpusWorkspaceLoading(false);
    setCorpusWorkspaceExporting(false);
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
  };
  const workspaceErrorText = (reason: unknown) => {
    if (reason instanceof EncryptedCorpusError) return ({
      invalid_password: "Use the exact case-sensitive 12–256 character passphrase. Password recovery is not available.",
      invalid_file: "Choose a valid encrypted ETERNYX backup .json (maximum approximately 4 MiB).",
      too_large: "Encrypted backup exceeds its size cap; the current workspace was not changed.",
      invalid_envelope: "Unsupported, malformed or noncanonical encrypted envelope. The workspace was not changed.",
      crypto_unavailable: "This browser cannot perform secure AES-GCM/PBKDF2; encrypted backup is unavailable.",
      authentication_failed: "Incorrect passphrase or altered ciphertext. No workspace data was imported.",
      encrypt_failed: "Unable to encrypt the backup. No encrypted download was created.",
      unchanged_password: "New passphrase must differ from the current passphrase. No new backup was created.",
    }[reason.code]);
    if (!(reason instanceof CorpusWorkspaceError)) return "Could not validate the local evidence workspace.";
    return ({
      invalid_file: "Choose a nonempty .json ETERNYX evidence backup (maximum 3 MiB).",
      too_large: "Workspace backup exceeds 3 MiB; nothing was imported or exported.",
      invalid_json: "Backup does not contain valid JSON; the current workspace was not changed.",
      invalid_schema: "Backup format/version or allowed fields are invalid; no data was imported.",
      invalid_document: "File labels, formats, IDs, or decoded text exceed corpus safety limits.",
      invalid_search: "Stored query, mode, filter or question is invalid.",
      hash_mismatch: "The backed-up text does not match its stored SHA-256. Nothing was imported.",
      crypto_unavailable: "Secure browser SHA-256 is unavailable; import/export is disabled rather than skipping verification.",
    }[reason.code]);
  };
  const invalidateCorpusFingerprints = () => {
    corpusHashVersion.current += 1;
    setCorpusFingerprints(null);
    setCorpusHashBusy(false);
  };

  const invalidateCorpus = () => {
    corpusAI.invalidate();
    setCorpusResults(null);
    setCorpusSelectedIds([]);
    setCorpusContext(null);
    setCorpusError(null);
    setCorpusNotice(null);
  };
  const corpusErrorText = (reason: unknown): string => {
    if (reason instanceof CorpusSearchError) {
      return ({
        invalid_file: "Use only nonempty TXT, Markdown, CSV, JSON or LOG text files (at most 100,000 characters each).",
        duplicate_file: "File names or IDs must be distinct. Remove the existing file before adding another with the same name.",
        file_limit: "The local evidence collection allows at most eight text documents.",
        too_large: "Input or selected evidence exceeds a safe local or AI request size limit; no partial operation was performed.",
        invalid_query: "Enter 1–8 Unicode search words (maximum 120 characters), and select a valid source filter.",
        too_many_matches: "More than 2,000 matching lines. Narrow the search; no partial results were returned.",
        invalid_evidence: "A selected evidence reference is stale or missing. Search again before submitting.",
        invalid_question: "Evidence question must be at most 250 characters.",
        too_many_evidence: "Select 1–6 distinct evidence excerpts for an opt-in AI explanation.",
      }[reason.code]);
    }
    if (reason instanceof CorpusReviewError) {
      return ({
        stale_source: "The selected excerpt no longer matches the current loaded source text. Search again before quoting or sending it.",
        invalid_selection: "Choose 1–6 distinct current source lines for the reviewed evidence export.",
        crypto_unavailable: "This browser does not expose Web Crypto SHA-256 in this context. No fingerprint was created.",
      }[reason.code]);
    }
    return reason instanceof LocalDocumentError ? explainError(reason)
      : reason instanceof DocumentPrivacyError
        ? "Too many sensitive-looking strings in the selected evidence; no AI request was made."
        : "Local multi-document search failed.";
  };
  const loadCorpusFiles = async (files: readonly File[]) => {
    const version = ++corpusReadVersion.current;
    invalidateCorpusWorkspace();
    invalidateCorpus();
    setCorpusBusy(files.length > 0);
    if (!files.length) return;
    try {
      if (corpusFiles.length + files.length > MAX_CORPUS_FILES) {
        throw new CorpusSearchError("file_limit");
      }
      const loaded = await Promise.all(files.map(file => readLocalDocument(file)));
      if (version !== corpusReadVersion.current) return;
      const additions: CorpusDocument[] = loaded.map(item => ({
        id: crypto.randomUUID(), name: item.name, kind: item.kind, text: item.text,
      }));
      const nextFiles = addCorpusDocuments(corpusFiles, additions);
      invalidateCorpusFingerprints();
      setCorpusFiles(nextFiles);
      setCorpusNotice(loaded.length + " local file(s) loaded. Nothing uploaded or persisted.");
    } catch (reason) {
      if (version === corpusReadVersion.current) setCorpusError(corpusErrorText(reason));
    } finally {
      if (version === corpusReadVersion.current) setCorpusBusy(false);
    }
  };
  const removeCorpusFile = (id: string) => {
    invalidateCorpusWorkspace();
    ++corpusReadVersion.current;
    setCorpusBusy(false);
    invalidateCorpusFingerprints();
    setCorpusFiles(existing => existing.filter(file => file.id !== id));
    if (corpusFilter === id) setCorpusFilter("");
    invalidateCorpus();
  };
  const clearCorpus = () => {
    if (corpusFiles.length && !window.confirm(
      "Clear all local multi-document evidence files and their search results? This cannot be undone.",
    )) return;
    invalidateCorpusWorkspace();
    ++corpusReadVersion.current;
    invalidateCorpusFingerprints();
    setCorpusFiles([]);
    setCorpusBusy(false);
    setCorpusFilter("");
    setCorpusQuery("");
    setCorpusMode("all");
    setCorpusQuestion("");
    invalidateCorpus();
  };
  const runCorpusSearch = () => {
    invalidateCorpus();
    try {
      setCorpusResults(searchCorpus(corpusFiles, corpusQuery, corpusMode, corpusFilter || null));
    } catch (reason) {
      setCorpusError(corpusErrorText(reason));
    }
  };
  const toggleCorpusHit = (id: string, checked: boolean) => {
    corpusAI.invalidate();
    setCorpusError(null);
    setCorpusSelectedIds(existing => checked
      ? existing.includes(id) || existing.length >= MAX_CORPUS_AI_EVIDENCE ? existing : [...existing, id]
      : existing.filter(item => item !== id));
  };
  const exportLocalCorpusWorkspace = async () => {
    const operation = ++corpusWorkspaceEpoch.current;
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
    setPendingCorpusWorkspace(null);
    setCorpusWorkspaceExporting(true);
    try {
      const serialized = await exportCorpusWorkspace({
        documents: corpusFiles,
        query: corpusQuery, mode: corpusMode,
        sourceFilter: corpusFilter || null, question: corpusQuestion,
      });
      if (operation !== corpusWorkspaceEpoch.current) return;
      const link = URL.createObjectURL(new Blob([serialized], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.download = "eternyx-local-evidence-workspace-v1.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(link), 1000);
      setCorpusWorkspaceNotice("Full decoded-text backup exported locally. Store this unencrypted JSON privately; nothing was uploaded.");
    } catch (reason) {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceError(workspaceErrorText(reason));
    } finally {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceExporting(false);
    }
  };
  const exportEncryptedCorpusWorkspace = async () => {
    const passphrase = encryptedExportPassword;
    const confirmation = encryptedExportConfirm;
    if (passphrase !== confirmation) {
      setCorpusWorkspaceError("Passphrases do not match. No backup was created.");
      return;
    }
    if (passphrase.length < MIN_ENCRYPTED_CORPUS_PASSWORD ||
        passphrase.length > MAX_ENCRYPTED_CORPUS_PASSWORD) {
      setCorpusWorkspaceError("Choose a case-sensitive passphrase of 12–256 characters.");
      return;
    }
    const operation = ++corpusWorkspaceEpoch.current;
    setEncryptedExportPassword("");
    setEncryptedExportConfirm("");
    setPendingCorpusWorkspace(null);
    setPendingCorpusEncrypted(false);
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
    setCorpusWorkspaceExporting(true);
    try {
      const serialized = await exportCorpusWorkspace({
        documents: corpusFiles,
        query: corpusQuery, mode: corpusMode,
        sourceFilter: corpusFilter || null, question: corpusQuestion,
      });
      if (operation !== corpusWorkspaceEpoch.current) return;
      const encrypted = await encryptCorpusWorkspace(serialized, passphrase);
      if (operation !== corpusWorkspaceEpoch.current) return;
      const url = URL.createObjectURL(new Blob([encrypted], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "eternyx-local-evidence-encrypted-v1.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCorpusWorkspaceNotice(
        "Encrypted backup downloaded locally. Keep the passphrase separately; no server received it. Without it, the backup cannot be recovered.",
      );
    } catch (reason) {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceError(workspaceErrorText(reason));
    } finally {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceExporting(false);
    }
  };
  const rotateEncryptedBackup = async (file: File | null) => {
    const oldPassphrase = rotateOldPassword;
    const newPassphrase = rotateNewPassword;
    const confirmation = rotateConfirmPassword;
    if (!file) return;
    if (newPassphrase !== confirmation) {
      setCorpusWorkspaceError("New passphrases do not match. Existing backup remains untouched.");
      return;
    }
    const operation = ++corpusWorkspaceEpoch.current;
    setRotateOldPassword("");
    setRotateNewPassword("");
    setRotateConfirmPassword("");
    setPendingCorpusWorkspace(null);
    setPendingCorpusEncrypted(false);
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
    setCorpusWorkspaceExporting(true);
    try {
      const updated = await rotateEncryptedCorpusFile(file, oldPassphrase, newPassphrase);
      if (operation !== corpusWorkspaceEpoch.current) return;
      const url = URL.createObjectURL(new Blob([updated], {type:"application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "eternyx-local-evidence-rekeyed-v1.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCorpusWorkspaceNotice(
        "Re-encrypted archive downloaded locally with a fresh salt and nonce. The old file still exists: delete it yourself only after testing the new passphrase. No plaintext download or AI call.",
      );
    } catch (reason) {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceError(workspaceErrorText(reason));
    } finally {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceExporting(false);
    }
  };
  const previewEncryptedCorpusWorkspace = async (file: File | null) => {
    const passphrase = encryptedImportPassword;
    const operation = ++corpusWorkspaceEpoch.current;
    setEncryptedImportPassword("");
    setPendingCorpusWorkspace(null);
    setPendingCorpusEncrypted(false);
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
    setCorpusWorkspaceLoading(!!file);
    if (!file) return;
    try {
      const verified = await readEncryptedCorpusFile(file, passphrase);
      if (operation !== corpusWorkspaceEpoch.current) return;
      setPendingCorpusWorkspace(verified);
      setPendingCorpusEncrypted(true);
      setCorpusWorkspaceNotice(
        "AES-GCM authentication, strict snapshot schema and all decoded-text SHA-256 values passed locally. No replacement has occurred.",
      );
    } catch (reason) {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceError(workspaceErrorText(reason));
    } finally {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceLoading(false);
    }
  };
  const previewCorpusWorkspace = async (file: File | null) => {
    const operation = ++corpusWorkspaceEpoch.current;
    setPendingCorpusWorkspace(null);
    setPendingCorpusEncrypted(false);
    setCorpusWorkspaceError(null);
    setCorpusWorkspaceNotice(null);
    setCorpusWorkspaceLoading(!!file);
    if (!file) return;
    try {
      const verified = await readCorpusWorkspaceFile(file);
      if (operation !== corpusWorkspaceEpoch.current) return;
      setPendingCorpusWorkspace(verified);
      setCorpusWorkspaceNotice(
        "Backup schema and all decoded-text SHA-256 values verified locally. No replacement or AI request has occurred.",
      );
    } catch (reason) {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceError(workspaceErrorText(reason));
    } finally {
      if (operation === corpusWorkspaceEpoch.current) setCorpusWorkspaceLoading(false);
    }
  };
  const restoreCorpusWorkspace = () => {
    if (!pendingCorpusWorkspace || !pendingCorpusReview?.replacementHasEffects ||
        corpusWorkspaceLoading || corpusWorkspaceExporting) return;
    if (!window.confirm(
      "REPLACE every current local evidence file and search setting with this validated backup? " +
      pendingCorpusReview.counts.removed + " existing file(s) will be REMOVED; " +
      pendingCorpusReview.counts["content-changed"] + " file(s) will have their text OVERWRITTEN. " +
      "The existing in-memory documents, selected excerpts and AI results will be discarded. " +
      "Save your existing workspace first if you need to keep it. No automatic merge or upload.",
    )) return;
    const imported = pendingCorpusWorkspace;
    // Stop pending user file reads and fingerprint generation before replacing.
    ++corpusReadVersion.current;
    setCorpusBusy(false);
    invalidateCorpusWorkspace();
    invalidateCorpusFingerprints();
    invalidateCorpus();
    setCorpusFiles(imported.documents.map(({ id, name, kind, text }) => ({ id, name, kind, text })));
    setCorpusQuery(imported.query);
    setCorpusMode(imported.mode);
    setCorpusFilter(imported.sourceFilter ?? "");
    setCorpusQuestion(imported.question);
    setCorpusWorkspaceNotice(
      "Validated local workspace restored. Search again to recompute fresh evidence; no cached hits or AI interpretation were imported.",
    );
  };
  const downloadCorpusResults = (format: "txt" | "json") => {
    if (!corpusResults) return;
    const text = format === "txt"
      ? formatCorpusSearch(corpusResults) : JSON.stringify(corpusResults, null, 2);
    const url = URL.createObjectURL(new Blob([text], {
      type: format === "txt" ? "text/plain;charset=utf-8" : "application/json",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "eternyx-local-evidence." + format;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCorpusNotice("Complete local result export requested. Nothing was sent to AI.");
  };
  const reviewCorpusHit = (id: string) => {
    if (!corpusResults) return;
    try {
      const hit = corpusResults.hits.find(candidate => candidate.id === id);
      if (!hit) throw new CorpusReviewError("invalid_selection");
      setCorpusContext(getCorpusSourceContext(corpusFiles, hit, 2));
      setCorpusError(null);
    } catch (reason) {
      setCorpusContext(null);
      setCorpusError(corpusErrorText(reason));
    }
  };
  const reviewSelectedCorpus = async (download: boolean) => {
    if (!corpusResults) return;
    try {
      const report = formatSelectedCorpusContext(corpusFiles, corpusResults, corpusSelectedIds);
      if (download) {
        const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "eternyx-reviewed-local-evidence.txt";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setCorpusNotice("Reviewed source context exported locally; no AI provider was contacted.");
      } else {
        await copy(report, "Reviewed local evidence");
      }
      setCorpusError(null);
    } catch (reason) {
      setCorpusError(corpusErrorText(reason));
    }
  };
  const generateCorpusFingerprints = async () => {
    const generation = ++corpusHashVersion.current;
    setCorpusFingerprints(null);
    setCorpusHashBusy(true);
    setCorpusError(null);
    try {
      const fingerprints = await fingerprintCorpusDecodedText(corpusFiles);
      if (generation !== corpusHashVersion.current) return;
      setCorpusFingerprints(fingerprints);
      setCorpusNotice("SHA-256 of the current decoded text calculated in your browser. This is not source authentication.");
    } catch (reason) {
      if (generation === corpusHashVersion.current) setCorpusError(corpusErrorText(reason));
    } finally {
      if (generation === corpusHashVersion.current) setCorpusHashBusy(false);
    }
  };
  const downloadCorpusFingerprints = () => {
    if (!corpusFingerprints) return;
    const text = formatCorpusFingerprints(corpusFingerprints);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "eternyx-local-source-sha256.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCorpusNotice("Local fingerprint manifest downloaded; no files or hashes were uploaded.");
  };
  const submitCorpusAI = () => {
    if (!corpusResults) return;
    try {
      // Re-check exact source text before sending any selected evidence.
      for (const id of corpusSelectedIds) {
        const hit = corpusResults.hits.find(candidate => candidate.id === id);
        if (!hit) throw new CorpusReviewError("invalid_selection");
        verifyCurrentCorpusHit(corpusFiles, hit);
      }
      const prompt = prepareCorpusAIRequest(corpusResults, corpusSelectedIds, corpusQuestion);
      const detected = inspectDocumentPrivacy(prompt).findings.length;
      if (detected > 0 && !window.confirm(
        "Selected excerpts contain " + detected +
        " sensitive-looking pattern(s). This sends the ORIGINAL selected text and source names to the external AI Chat provider, consumes ai.chat credits and saves chat history. Continue?",
      )) return;
      setCorpusError(null);
      setCorpusNotice(null);
      void corpusAI.run("ai.documents.analyze", prompt);
    } catch (reason) {
      setCorpusError(corpusErrorText(reason));
    }
  };

  const invalidatePrivacy = () => {
    setPrivacyCopy(null);
    setPrivacyUseForAI(false);
    setPrivacyError(null);
    setPrivacyNotice(null);
  };

  const invalidateComparison = () => {
    comparisonAI.invalidate();
    setComparison(null);
    setStructuredComparison(null);
    setComparisonError(null);
  };
  const invalidate = () => {
    invalidateComparison();
    invalidatePrivacy();
    ai.invalidate();
    setInspection(null);
    setSearchResults(null);
    setDraft(null);
    setError(null);
    setNotice(null);
  };

  const explainError = (reason: unknown) => reason instanceof LocalDocumentError
    ? ({
      invalid_file: "Choose a nonempty TXT, Markdown, CSV, JSON or LOG text file no larger than 1 MiB.",
      invalid_text: "Document text must contain 1–100,000 characters and cannot contain binary NUL bytes.",
      invalid_kind: "Choose a supported document type.",
      invalid_search: "Enter a search term of 1–100 characters.",
      invalid_task: "Select document analysis or structured extraction.",
      invalid_instruction: "Instructions must be at most 1,000 characters; extraction needs field instructions.",
      read_failed: "The local file could not be read.",
    }[reason.code])
    : "The local document operation failed.";

  const chooseFile = async (file: File | null) => {
    const version = ++fileReadVersion.current;
    setLoading(!!file);
    if (!file) return;
    setError(null);
    try {
      const loaded = await readLocalDocument(file);
      if (version !== fileReadVersion.current) return;
      invalidate();
      setKind(loaded.kind);
      setSource(loaded.text);
      setAiPassage(null);
      setFileName(loaded.name);
    } catch (e) {
      if (version === fileReadVersion.current) setError(explainError(e));
    } finally {
      if (version === fileReadVersion.current) setLoading(false);
    }
  };

  const chooseComparisonFile = async (file: File | null) => {
    const version = ++comparisonReadVersion.current;
    invalidateComparison();
    setComparisonLoading(!!file);
    setComparisonSource("");
    setComparisonFileName(null);
    if (!file) {
      setComparisonLoading(false);
      return;
    }
    try {
      const loaded = await readLocalDocument(file);
      if (version !== comparisonReadVersion.current) return;
      setComparisonSource(loaded.text);
      setComparisonFileName(loaded.name);
    } catch (failure) {
      if (version === comparisonReadVersion.current) {
        setComparisonError(explainError(failure));
      }
    } finally {
      if (version === comparisonReadVersion.current) setComparisonLoading(false);
    }
  };
  const editComparisonSource = (value: string) => {
    comparisonReadVersion.current += 1;
    setComparisonLoading(false);
    setComparisonSource(value);
    setComparisonFileName(null);
    invalidateComparison();
  };
  const compareDocuments = () => {
    invalidateComparison();
    try {
      if (comparisonMode === "line") {
        setComparison(compareLocalDocuments(source, comparisonSource, {
          beforeName: fileName, afterName: comparisonFileName,
          ignoreWhitespace: comparisonIgnoreWhitespace,
        }));
      } else {
        const options = { sourceA: fileName, sourceB: comparisonFileName };
        setStructuredComparison(comparisonMode === "json"
          ? compareStructuredJson(source, comparisonSource, options)
          : compareStructuredCsv(source, comparisonSource, comparisonCsvKey, options));
      }
    } catch (reason) {
      const messages: Record<string, string> = {
        invalid_source: "Enter nonempty text in both source boxes.",
        too_long: "Each comparison input must contain at most 100,000 characters.",
        too_many_lines: "Each input must have at most 1,200 lines for bounded local comparison.",
      };
      const structuredErrors: Record<string, string> = {
        invalid_input: "Both source documents must contain nonempty, nonbinary text.",
        too_long: "Each structured input must contain at most 100,000 characters.",
        invalid_json: "Both inputs must be valid JSON. No comparison was performed.",
        invalid_csv: "Both inputs must be well-formed CSV with unique headers and equal-width records.",
        too_deep: "JSON nesting exceeds the safe depth limit (32).",
        too_many_nodes: "JSON has too many nested nodes for a bounded local comparison (5,000).",
        too_many_rows: "CSV must contain at most 1,200 data records in each input.",
        too_many_columns: "CSV must contain at most 100 columns in each input.",
        too_many_changes: "Over 2,000 changes; comparison refused rather than silently truncated.",
        invalid_key: "Enter a CSV key column present in both header rows. Every key value must be nonempty.",
        duplicate_key: "Duplicate CSV key values found. Choose a unique column; no arbitrary row matching was performed.",
        schema_mismatch: "CSV column names must match between sources (column order may differ).",
      };
      setComparisonError(reason instanceof StructuredCompareError
        ? structuredErrors[reason.code] || "Structured comparison was rejected safely."
        : reason instanceof DocumentCompareError
          ? messages[reason.code] || "Comparison could not be completed safely."
          : "Local comparison failed.");
    }
  };
  const downloadComparison = (format: "txt" | "json") => {
    if (!comparison) return;
    const contents = format === "txt" ? formatDocumentComparison(comparison)
      : JSON.stringify(comparison, null, 2);
    const url = URL.createObjectURL(new Blob([contents], {
      type: format === "txt" ? "text/plain;charset=utf-8" : "application/json",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-local-document-diff." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadStructuredComparison = (format: "txt" | "json") => {
    if (!structuredComparison) return;
    const contents = format === "txt"
      ? formatStructuredComparison(structuredComparison)
      : JSON.stringify(structuredComparison, null, 2);
    const url = URL.createObjectURL(new Blob([contents], {
      type: format === "txt" ? "text/plain;charset=utf-8" : "application/json",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-structured-comparison." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const analyzeComparison = () => {
    if (!comparison && !structuredComparison) return;
    try {
      const prompt = structuredComparison
        ? prepareStructuredComparisonAIRequest(structuredComparison, comparisonQuestion)
        : prepareDocumentComparisonAIRequest(comparison!, comparisonQuestion);
      // Comparison reports are a separate AI submission path. The document
      // redaction checkbox does NOT silently affect them; warn if the exact
      // diff prompt contains detected sensitive-looking values.
      const sensitiveCount = inspectDocumentPrivacy(prompt).findings.length;
      if (sensitiveCount > 0 && !window.confirm(
        "The comparison report contains " + sensitiveCount +
        " possible sensitive values. Sending the ORIGINAL comparison to the external AI Chat provider consumes ai.chat credits and stores chat history. Continue?",
      )) return;
      setComparisonError(null);
      void comparisonAI.run("ai.documents.analyze", prompt);
    } catch (reason) {
      const message = reason instanceof StructuredCompareError
        ? ({
            no_changes: "No structured changes to analyze. Both inputs match under the selected mode.",
            too_many_changes: "AI Chat accepts at most 12 structural changes. Narrow inputs manually; no request was made.",
            too_long: "Structural changes exceed the AI Chat request budget. Narrow inputs; nothing was silently truncated.",
            invalid_question: "Optional question must contain at most 250 characters.",
          } as Record<string, string>)[reason.code] || "The structured AI request was rejected safely."
        : reason instanceof DocumentCompareError
          ? ({
              no_changes: "No changes to analyze. The two documents match under the selected comparison mode.",
              too_many_changes: "AI analysis accepts at most 12 changed lines. Narrow your source texts; no AI request was made.",
              too_long: "The differences exceed the chat message budget. Narrow both sources manually; no text was silently truncated.",
              invalid_question: "The comparison question must be at most 250 characters.",
              invalid_source: "Both documents are required.",
              too_many_lines: "Too many lines for comparison.",
            }[reason.code])
          : reason instanceof DocumentPrivacyError
          ? "Too many possible sensitive strings in the comparison. Narrow the source data; no AI request was sent."
          : "AI comparison request could not be prepared.";
      setComparisonError(message);
    }
  };
  const setEditedSource = (value: string) => {
    fileReadVersion.current += 1;
    setLoading(false);
    setFileName(null);
    setSource(value);
    setAiPassage(null);
    invalidate();
  };

  const clear = () => {
    if ((source || instruction) && !window.confirm("Clear the document, search results and request draft?")) return;
    fileReadVersion.current += 1;
    setLoading(false);
    setKind("txt");
    setSource("");
    comparisonReadVersion.current += 1;
    setComparisonSource("");
    setComparisonFileName(null);
    setComparisonIgnoreWhitespace(false);
    setComparisonMode("line");
    setComparisonCsvKey("");
    setComparisonQuestion("");
    setComparisonLoading(false);
    setAiPassage(null);
    setFileName(null);
    setSearchTerm("");
    setCaseSensitive(false);
    setTask("analyze");
    setInstruction("");
    invalidate();
  };
  const inspect = () => {
    setError(null);
    setInspection(null);
    try {
      setInspection(inspectLocalDocument(source, kind));
    } catch (e) { setError(explainError(e)); }
  };
  const search = () => {
    setError(null);
    setSearchResults(null);
    try {
      setSearchResults(findDocumentMatches(source, searchTerm, caseSensitive));
    } catch (e) { setError(explainError(e)); }
  };
  const goToHeading = (line: number) => {
    const field = sourceField.current;
    if (!field) return;
    const lines = field.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0);
    field.focus();
    field.setSelectionRange(start, start + lines[line - 1].length);
  };

  const downloadMatches = (format: "json" | "txt") => {
    if (!searchResults) return;
    const report = {
      fileName, kind, caseSensitive, query: searchResults.query,
      total: searchResults.total, truncated: searchResults.truncated,
      matches: searchResults.matches.map(({ line, column, excerpt, excerptOffset, length }) => ({
        line, column, excerpt, matchedText: excerpt.slice(excerptOffset, excerptOffset + length),
      })),
    };
    const contents = format === "json" ? JSON.stringify(report, null, 2) : [
      fileName || "Pasted document",
      `Search: ${report.query} · ${caseSensitive ? "case-sensitive" : "case-insensitive"}`,
      `Showing ${report.matches.length} of ${report.total} matches`,
      ...report.matches.map(m => `Line ${m.line}, column ${m.column} · ${m.matchedText}\n${m.excerpt}`),
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([contents], { type: format === "json" ? "application/json" : "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-document-matches." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const prepare = () => {
    setError(null);
    setDraft(null);
    try {
      setDraft(prepareDocumentDraft(source, kind, task, instruction));
    } catch (e) { setError(explainError(e)); }
  };
  const captureSelectedPassage = () => {
    const field = sourceField.current;
    if (!field || field.selectionStart === field.selectionEnd) {
      setError("Highlight a specific passage in the document text first.");
      return;
    }
    const passage = source.slice(field.selectionStart, field.selectionEnd);
    if (!passage.trim()) {
      setError("Select a nonempty passage to send for AI analysis.");
      return;
    }
    setAiPassage(passage);
    invalidatePrivacy();
    ai.invalidate();
    setError(null);
    setNotice("Excerpt selected. Nothing was uploaded or sent to AI.");
  };
  const inspectPrivacy = () => {
    setPrivacyError(null);
    setPrivacyNotice(null);
    setPrivacyCopy(null);
    setPrivacyUseForAI(false);
    ai.invalidate();
    try {
      const redaction = redactDocumentPrivacy(privacyTarget);
      setPrivacyCopy({ ...redaction, sourceText: privacyTarget });
      setPrivacyNotice(redaction.report.findings.length
        ? "Candidate strings masked locally. Inspect the complete text carefully; patterns may miss sensitive information."
        : "No configured patterns matched. This does NOT prove the document is safe to share.");
    } catch (reason) {
      setPrivacyError(reason instanceof DocumentPrivacyError
        ? reason.code === "too_many_findings"
          ? "Too many possible sensitive strings to review reliably (limit 250). Narrow the input; no partial copy was produced."
          : reason.code === "too_large"
            ? "Privacy scan accepts at most 100,000 characters; narrow the selection."
            : "Select a nonempty document or highlighted excerpt to inspect."
        : "Unable to inspect the selected text locally.");
    }
  };
  const copyPrivacyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setPrivacyNotice(label + " copied locally; nothing was sent to AI Chat.");
      setPrivacyError(null);
    } catch {
      setPrivacyError("Clipboard unavailable. Select and copy the content manually.");
    }
  };
  const downloadPrivacyText = (kind: "redacted" | "audit") => {
    if (!privacyCurrent) return;
    const value = kind === "redacted"
      ? privacyCurrent.text : formatDocumentPrivacyAudit(privacyCurrent.report);
    const url = URL.createObjectURL(new Blob([value], {type: "text/plain;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = kind === "redacted"
      ? "eternyx-reviewed-redacted-text.txt"
      : "eternyx-privacy-pattern-audit.txt";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPrivacyNotice("Local text export requested. No remote upload was made.");
  };
  const askAI = () => {
    try {
      let chosenText = aiPassage ?? source;
      if (privacyUseForAI) {
        if (!privacyCurrent || !privacyCurrent.text.trim()) {
          setError("The reviewed redacted text is stale or missing. Re-run the local privacy inspection before using AI Chat.");
          return;
        }
        chosenText = privacyCurrent.text;
      } else {
        // This is an advisory pattern gate. It cannot identify all sensitive
        // material; require extra confirmation when known patterns are found.
        const findings = inspectDocumentPrivacy(chosenText).findings.length;
        if (findings > 0 && !window.confirm(
          "This text contains " + findings +
          " possible sensitive strings. Send the UNREDACTED text to the configured external AI provider using ai.chat credits and saved history anyway?",
        )) return;
      }
      const request = prepareDocumentDraft(chosenText, kind, task, instruction);
      setDraft(request);
      setError(null);
      setNotice(null);
      void ai.run(request.featureKey, formatDocumentDraft(request));
    } catch (failure) {
      setError(failure instanceof DocumentPrivacyError
        ? failure.code === "too_many_findings"
          ? "Too many possible sensitive strings. Narrow the document or select an excerpt; no AI request was sent."
          : "The document cannot be scanned safely before AI submission."
        : explainError(failure));
    }
  };
  const copyAIResult = async () => {
    if (!ai.result) return;
    try {
      await navigator.clipboard.writeText(ai.result);
      setNotice("AI-generated response copied.");
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Select the AI response and copy it manually.");
    }
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(label + " copied. No AI service was contacted.");
      setError(null);
    } catch {
      setError("Clipboard permission was denied. Select and copy the text manually.");
      setNotice(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="text-slate-300">
          <Link to="/ai-arsenal"><ArrowLeft className="mr-2 h-4 w-4" />AI Arsenal</Link>
        </Button>
        <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-violet-950/30 p-7 sm:p-10">
          <div className="flex items-center gap-3 text-cyan-200"><FileSearch className="h-7 w-7" />LOCAL DOCUMENT WORKSPACE</div>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">AI Document Intelligence</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Inspect and search local text, or explicitly request AI analysis or field extraction from a chosen text passage.
          </p>
          <Badge variant="outline" className="mt-4 border-amber-400/30 text-amber-200">Local tools · opt-in AI Chat text analysis</Badge>
        </section>

        <Alert className="border-amber-400/30 bg-amber-950/20 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            TXT, Markdown, CSV, JSON and LOG inspection stays local. Only clicking Analyze with AI Chat sends
            the full document text or a selected excerpt to the authenticated chat backend and its configured provider,
            and stores it in chat history using ai.chat credits. No automatic upload, PDF parsing, OCR, image analysis,
            independent fact checking or dedicated document model is activated. Do not send sensitive documents without permission.
            The AI request, including task instructions, must fit 4,000 characters; content is never silently truncated.
            File extension and MIME labels are not verified proof of a document's format.
            The local Privacy Guard detects only selected patterns. Its redacted-copy switch affects document
            analysis/extraction, not separate comparison AI prompts; those prompts receive a detection warning
            and require confirmation if common sensitive-looking values are found.
          </AlertDescription>
        </Alert>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Private document input</CardTitle>
            <CardDescription className="text-slate-400">Read a local text file (maximum 1 MiB) or paste text below (maximum 100,000 characters).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="document-local-file" className="block text-sm text-slate-300">Choose a local text file</label>
            <input
              id="document-local-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.log"
              onChange={e => {
                void chooseFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
            />
            {loading && <p role="status" className="text-sm text-cyan-200">Reading local file…</p>}
            {fileName && <p className="break-all text-sm text-slate-300">Loaded locally: {fileName}</p>}
            <label htmlFor="document-kind" className="block space-y-2 text-sm text-slate-300">
              <span>Interpret content as</span>
              <select id="document-kind" value={kind} onChange={e => { setKind(e.target.value as LocalDocumentKind); invalidate(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                {DOCUMENT_KINDS.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}
              </select>
            </label>
            <label htmlFor="document-source" className="block space-y-2 text-sm text-slate-300">
              <span>Document text</span>
              <textarea ref={sourceField} id="document-source" value={source} maxLength={MAX_DOCUMENT_CHARACTERS} rows={10}
                onChange={e => setEditedSource(e.target.value)}
                placeholder="Paste plain text, Markdown, CSV or JSON here. Local inspection stays private; AI submission requires a separate click…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span>{source.length}/{MAX_DOCUMENT_CHARACTERS} characters</span>
              <span>Local file limit: {MAX_DOCUMENT_BYTES / (1024 * 1024)} MiB</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={inspect} disabled={!source.trim() || loading}><FileCheck2 className="mr-2 h-4 w-4" />Inspect document</Button>
              <Button type="button" variant="outline" disabled={!source.trim() || loading} onClick={captureSelectedPassage}>
                <ScanSearch className="mr-2 h-4 w-4" />Use highlighted excerpt for AI
              </Button>
              <Button type="button" variant="ghost" onClick={clear}><RotateCcw className="mr-2 h-4 w-4" />Clear workspace</Button>
            </div>
            {aiPassage && (
              <p role="status" className="text-xs text-cyan-200">
                AI excerpt selected: {aiPassage.length} characters. Only this excerpt—not the entire document—will be submitted if you click Analyze with AI Chat.
              </p>
            )}
            {inspection && (
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <strong className="text-white">Local document inspection</strong>
                <p className="text-sm text-slate-300">{inspection.metrics.characters} characters · {inspection.metrics.words} words · {inspection.metrics.lines} lines · {inspection.metrics.paragraphs} paragraphs</p>
                {inspection.kind === "md" && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">Markdown headings (first 100): {inspection.headings.length}{inspection.headingsTruncated ? " · additional headings omitted" : ""}</p>
                    <ul className="max-h-60 space-y-1 overflow-auto text-sm text-slate-400">
                      {inspection.headings.map((heading, index) => <li key={index}><button type="button" onClick={() => goToHeading(heading.line)} className="min-h-11 break-words rounded px-1 text-left text-cyan-200 underline underline-offset-4 focus-visible:ring-2">Line {heading.line} · {heading.text}</button></li>)}
                    </ul>
                  </div>
                )}
                {inspection.json && (
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>JSON syntax: {inspection.json.valid ? "Valid" : "Invalid"} · Root: {inspection.json.root}</p>
                    {inspection.json.itemCount !== null && <p>Array items: {inspection.json.itemCount}</p>}
                    {inspection.json.topLevelKeys.length > 0 && <p className="break-words">First 50 top-level keys: {inspection.json.topLevelKeys.join(", ")}</p>}
                  </div>
                )}
                {inspection.csv && (
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>CSV syntax: {inspection.csv.valid ? "Valid" : "Malformed"} · Rows: {inspection.csv.rows} · Maximum columns: {inspection.csv.columns} · Unequal-width rows: {inspection.csv.inconsistentRows}</p>
                    {inspection.csv.valid && (
                      <div className="max-h-60 overflow-auto">
                        <table className="min-w-full text-left text-xs">
                          <tbody>{inspection.csv.preview.map((row, i) => (
                            <tr key={i} className="border-b border-slate-800">{row.map((value, j) => <td key={j} className="max-w-64 break-words p-2 align-top">{value}</td>)}</tr>
                          ))}</tbody>
                        </table>
                        <p className="text-xs text-slate-500">Preview limited to the first 6 rows and 100 columns; cells truncated for display.</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-amber-200">Mechanical inspection only. No semantic AI understanding or verified field extraction.</p>
              </div>
            )}
            {error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert role="status" aria-live="polite"><ShieldCheck className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Document Privacy Guard · local pattern inspection</CardTitle>
            <CardDescription className="text-slate-400">
              Look for selected email addresses, credential assignments, bearer/JWT-like tokens,
              Luhn-valid payment-card-like numbers and international phone patterns in the current
              text or highlighted AI excerpt. This is a heuristic aid, not comprehensive privacy protection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-amber-200">
              Local scan and redaction only. It does not upload text, identify every secret,
              validate card ownership, or make a document automatically safe for external AI.
              Names, addresses, uncommon token formats, and context-dependent private data can remain.
              Review the entire resulting text before sharing.
            </p>
            <p className="text-sm text-slate-300">
              Target: {aiPassage ? "Highlighted AI excerpt" : "Entire source document"} · {privacyTarget.length.toLocaleString()} characters
            </p>
            <Button type="button" variant="outline" disabled={!privacyTarget.trim() || loading} onClick={inspectPrivacy}>
              <ShieldCheck className="mr-2 h-4 w-4"/>Inspect & build local redacted copy
            </Button>
            {privacyCurrent && (
              <section aria-label="Local privacy review" className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-950 p-4">
                <p role="status" className="text-sm text-slate-200">
                  Detected {privacyCurrent.report.findings.length} candidate strings.
                  Replaced {privacyCurrent.replacedCharacters} original characters with visible markers.
                </p>
                <p className="text-xs text-slate-400">{privacyCurrent.report.note}</p>
                <ul className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                  {Object.entries(privacyCurrent.report.counts).map(([key, count]) => (
                    <li className="rounded border border-slate-800 p-2" key={key}>{key.replace(/_/g, " ")}: {count}</li>
                  ))}
                </ul>
                {privacyCurrent.report.findings.length > 0 && (
                  <details className="text-xs text-slate-300">
                    <summary className="cursor-pointer text-cyan-200">
                      Inspect redaction positions (no matched values shown)
                    </summary>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                      {privacyCurrent.report.findings.map((finding, index) => (
                        <li key={index}>{finding.kind.replace(/_/g, " ")} · line {finding.line},
                          column {finding.column} · {finding.characters} masked characters</li>
                      ))}
                    </ul>
                  </details>
                )}
                <label htmlFor="document-privacy-redacted-output" className="block space-y-2 text-sm text-slate-300">
                  <span>Full redacted copy · inspect manually before using it</span>
                  <textarea id="document-privacy-redacted-output" readOnly rows={7}
                    value={privacyCurrent.text}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline"
                    onClick={() => void copyPrivacyText(privacyCurrent.text, "Redacted text")}>
                    <ClipboardCopy className="mr-2 h-4 w-4"/>Copy redacted text
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadPrivacyText("redacted")}>
                    Download redacted text (.txt)
                  </Button>
                  <Button type="button" variant="outline"
                    onClick={() => void copyPrivacyText(formatDocumentPrivacyAudit(privacyCurrent.report), "Value-free privacy audit")}>
                    Copy value-free audit
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadPrivacyText("audit")}>
                    Download audit (.txt)
                  </Button>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={privacyUseForAI}
                    onChange={e => { setPrivacyUseForAI(e.target.checked); ai.invalidate(); }}
                    className="mt-1"
                  />
                  <span>Use this reviewed redacted copy for the next document AI Chat analysis/extraction
                    instead of the raw document or excerpt. AI Chat still sends the selected text
                    to an external provider, uses ai.chat credits and saves chat history.
                    No configured pattern match does not imply safety.</span>
                </label>
                {privacyUseForAI && <p role="status" className="text-xs text-cyan-200">
                  Next AI request will use this exact redacted text. Changing the source or
                  selected excerpt invalidates the copy and switches back to explicit raw-text review.
                </p>}
              </section>
            )}
            {privacyError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4"/><AlertDescription>{privacyError}</AlertDescription>
            </Alert>}
            {privacyNotice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4"/><AlertDescription>{privacyNotice}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Local two-document comparison</CardTitle>
            <CardDescription className="text-slate-400">
              Compare the source above (A) to an independent text file or pasted text (B).
              Compare raw lines, JSON fields by exact RFC 6901 paths, or CSV records by a unique key.
              All differences are computed privately in your browser, not generated by AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-400">
              Raw text comparison is bounded to {MAX_COMPARISON_LINES.toLocaleString()} lines per input.
              Structural JSON/CSV comparison uses additional depth, row and change caps.
              No source files leave the browser unless you explicitly request AI interpretation
              of a small, complete difference report.
            </p>
            <p className="break-all text-sm text-slate-300">Source A: {fileName || "Current pasted/edited document"}</p>
            <label htmlFor="document-compare-file" className="block text-sm text-slate-300">Optional source B text file</label>
            <input
              id="document-compare-file" type="file" accept=".txt,.md,.markdown,.csv,.json,.log"
              onChange={e => {
                void chooseComparisonFile(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
              className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
            />
            {comparisonLoading && <p role="status" className="text-sm text-cyan-200">Reading source B locally…</p>}
            <label htmlFor="document-compare-source" className="block space-y-2 text-sm text-slate-300">
              <span>Source B {comparisonFileName ? "· " + comparisonFileName : "· pasted or edited text"}</span>
              <textarea id="document-compare-source" rows={7} maxLength={MAX_DOCUMENT_CHARACTERS}
                value={comparisonSource} onChange={e => editComparisonSource(e.target.value)}
                placeholder="Paste the second document to compare with source A above…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <label htmlFor="document-comparison-mode" className="block space-y-2 text-sm text-slate-300">
              <span>Comparison method</span>
              <select id="document-comparison-mode" value={comparisonMode}
                onChange={e => {
                  setComparisonMode(e.target.value as "line" | "json" | "csv");
                  invalidateComparison();
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                <option value="line">Line-by-line text</option>
                <option value="json">JSON fields and array indexes</option>
                <option value="csv">CSV rows matched by unique key</option>
              </select>
            </label>
            {comparisonMode === "line" && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={comparisonIgnoreWhitespace} onChange={e => {
                  setComparisonIgnoreWhitespace(e.target.checked); invalidateComparison();
                }} />
                Ignore whitespace changes when matching lines
              </label>
            )}
            {comparisonMode === "json" && (
              <p className="text-xs text-slate-400">
                JSON keys are compared regardless of property order. Pointers follow RFC 6901.
                Arrays are compared by index, not inferred moves; invalid JSON or overly deep documents are rejected.
              </p>
            )}
            {comparisonMode === "csv" && (
              <div className="space-y-2">
                <label htmlFor="document-comparison-key" className="block space-y-1 text-sm text-slate-300">
                  <span>Required unique CSV key column — exact header name, case-sensitive</span>
                  <input id="document-comparison-key" value={comparisonCsvKey} maxLength={100}
                    onChange={e => { setComparisonCsvKey(e.target.value); invalidateComparison(); }}
                    placeholder="For example: asset_id"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
                </label>
                <p className="text-xs text-slate-400">
                  Matching key values must be present and unique in each file. Column order may vary,
                  but the two header sets must match. Quoted commas and multiline cells are supported.
                </p>
              </div>
            )}
            <Button type="button" disabled={!source.trim() || !comparisonSource.trim() || loading || comparisonLoading ||
              (comparisonMode === "csv" && !comparisonCsvKey)}
              onClick={compareDocuments}>
              <FileCheck2 className="mr-2 h-4 w-4" />Compare documents locally
            </Button>
            {comparison && (
              <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Actual local text diff · no AI call</Badge>
                <p role="status" className="text-sm text-slate-300">
                  {comparison.identical ? "No line differences found under this comparison mode." :
                    comparison.removedLines + " removed · " + comparison.addedLines + " added · " +
                    comparison.unchangedLines + " unchanged lines"}
                </p>
                <p className="text-xs text-slate-400">
                  Source A: {comparison.beforeName} ({comparison.beforeLines} lines). Source B:
                  {" "}{comparison.afterName} ({comparison.afterLines} lines). Exact original line numbers are retained.
                </p>
                {comparison.changes.length > 60 && <p className="text-xs text-amber-200">
                  Displaying the first 60 of {comparison.changes.length} changed lines.
                  Download the complete report to inspect all changes.
                </p>}
                <ul className="max-h-72 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {comparison.changes.slice(0, 60).map((entry, index) => (
                    <li key={index} className="rounded-md border border-slate-700 p-2">
                      <strong className={entry.kind === "removed" ? "text-rose-300" : "text-emerald-300"}>
                        {entry.kind === "removed" ? "Removed · A line " + entry.beforeLine : "Added · B line " + entry.afterLine}
                      </strong>
                      <p className="mt-1 whitespace-pre-wrap break-words">{entry.text || "(empty line)"}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void copy(formatDocumentComparison(comparison), "Full document differences")}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />Copy full difference report
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadComparison("txt")}>
                    Download all (.txt)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadComparison("json")}>
                    Download all (.json)
                  </Button>
                </div>
              </div>
            )}
            {structuredComparison && (
              <section aria-label="Structured document differences" className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Exact local {structuredComparison.mode.toUpperCase()} comparison · no AI call</Badge>
                <p role="status" className="text-sm text-slate-300">
                  {structuredComparison.identical ? "No structural changes found." :
                    structuredComparison.added + " added · " + structuredComparison.removed + " removed · " +
                    structuredComparison.changed + " changed"}
                  {" · "}{structuredComparison.unchanged} unchanged fields/cells
                </p>
                <p className="text-xs text-slate-400">
                  {structuredComparison.mode === "json"
                    ? "JSON property names are order-independent. Arrays are index-based; paths use RFC 6901 notation."
                    : "CSV records are aligned by exact unique key values. Column order is ignored; header sets must match."}
                  {" "}Values are copied from source data; no model verifies them.
                </p>
                {structuredComparison.changes.length > 50 && <p className="text-xs text-amber-200">
                  Displaying the first 50 of {structuredComparison.changes.length} changes.
                  TXT/JSON downloads include the full report without truncation.
                </p>}
                <ul className="max-h-80 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {structuredComparison.changes.slice(0, 50).map((entry, index) => (
                    <li key={index} className="rounded-md border border-slate-700 p-3">
                      <strong className="break-all text-cyan-200">
                        {entry.kind.toUpperCase()} · {entry.location || "(JSON root)"}
                      </strong>
                      <p className="mt-2 break-all whitespace-pre-wrap text-rose-200">
                        Before: {entry.before === null ? "(not present)" : entry.before}
                      </p>
                      <p className="mt-1 break-all whitespace-pre-wrap text-emerald-200">
                        After: {entry.after === null ? "(not present)" : entry.after}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline"
                    onClick={() => void copy(formatStructuredComparison(structuredComparison), "Structured difference report")}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />Copy full structural report
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadStructuredComparison("txt")}>
                    Download full report (.txt)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadStructuredComparison("json")}>
                    Download full report (.json)
                  </Button>
                </div>
              </section>
            )}
            <section aria-label="Optional AI difference analysis" className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4">
              <h3 className="font-semibold text-white">Optional AI interpretation of actual changes</h3>
              <p className="text-sm text-slate-400">
                Only clicking Analyze changes with AI Chat sends the bounded diff text to an external
                model, uses existing ai.chat credits and stores chat history. Maximum {MAX_COMPARISON_AI_CHANGES}
                changed lines or {MAX_STRUCTURED_AI_CHANGES} JSON/CSV structural changes; larger reports must be
                narrowed manually, without silent truncation.
                The model's interpretation is not independent verification of either original document.
              </p>
              <label htmlFor="document-comparison-question" className="block space-y-2 text-sm text-slate-300">
                <span>Optional comparison question · maximum 250 characters</span>
                <input id="document-comparison-question" value={comparisonQuestion} maxLength={250}
                  onChange={e => { setComparisonQuestion(e.target.value); comparisonAI.invalidate(); }}
                  placeholder="Which requirements changed and need review?"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white"
                />
              </label>
              <Button type="button" onClick={analyzeComparison}
                disabled={comparisonAI.loading ||
                  (!comparison && !structuredComparison) ||
                  (comparison !== null && (comparison.identical || comparison.changes.length > MAX_COMPARISON_AI_CHANGES)) ||
                  (structuredComparison !== null && (structuredComparison.identical ||
                    structuredComparison.changes.length > MAX_STRUCTURED_AI_CHANGES))}>
                {comparisonAI.loading ? "Analyzing comparison…" : "Analyze changes with AI Chat"}
              </Button>
              {comparison && comparison.changes.length > MAX_COMPARISON_AI_CHANGES && (
                <p role="status" className="text-xs text-amber-200">
                  This comparison has {comparison.changes.length} changed lines.
                  Narrow the documents to at most {MAX_COMPARISON_AI_CHANGES} differences for optional AI analysis.
                  Full local copy and downloads still work.
                </p>
              )}
              {structuredComparison && structuredComparison.changes.length > MAX_STRUCTURED_AI_CHANGES && (
                <p role="status" className="text-xs text-amber-200">
                  This structural comparison has {structuredComparison.changes.length} changes.
                  Narrow your input to 12 changes or fewer before sending for AI analysis.
                  Local exports remain available.
                </p>
              )}
              {comparisonAI.error && <Alert role="alert" variant="destructive">
                <XCircle className="h-4 w-4" /><AlertDescription>{comparisonAI.error}</AlertDescription>
              </Alert>}
              {comparisonAI.result && <div className="space-y-2">
                <Badge variant="outline">AI interpretation · verify against both documents</Badge>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{comparisonAI.result}</pre>
                <Button type="button" variant="outline" onClick={() => void copy(comparisonAI.result!, "AI document comparison")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy AI interpretation
                </Button>
              </div>}
            </section>
            {comparisonError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4" /><AlertDescription>{comparisonError}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader>
            <CardTitle className="text-white">Multi-document keyword evidence search</CardTitle>
            <CardDescription className="text-slate-400">
              Search up to {MAX_CORPUS_FILES} local text documents together, with source filenames,
              original line numbers, explicit keyword-coverage scoring, exact phrase/proximity modes,
              surrounding source context, local SHA-256 text fingerprints and selectable evidence.
              No embeddings, online search, OCR or generated findings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-amber-200">
              Completely local until you explicitly send selected excerpts to AI Chat.
              Files are held only in memory (not uploaded or saved).
              100,000 characters per file; 400,000 characters total.
              Matches are exact Unicode word tokens, not semantic similarity.
            </p>
            <label htmlFor="document-corpus-files" className="block space-y-2 text-sm text-slate-300">
              <span>Choose independent TXT, Markdown, CSV, JSON or LOG documents (multiple selection)</span>
              <input id="document-corpus-files" type="file" multiple
                accept=".txt,.md,.markdown,.csv,.json,.log" disabled={corpusBusy || corpusFiles.length >= MAX_CORPUS_FILES}
                onChange={e => {
                  void loadCorpusFiles(Array.from(e.target.files ?? []));
                  e.currentTarget.value = "";
                }}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
              />
            </label>
            <p role="status" className="text-xs text-slate-400">
              {corpusFiles.length} / {MAX_CORPUS_FILES} files · {corpusCharacters.toLocaleString()} / 400,000 characters
            </p>
            <section aria-label="Portable local evidence workspace backup and restore"
              className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-950 p-4">
              <h3 className="font-semibold text-white">Portable evidence workspace · local verified backup</h3>
              <p className="text-xs text-amber-200">
                Plaintext exports contain COMPLETE ORIGINAL DECODED DOCUMENT TEXT, filenames, searches
                and questions. Use the password-encrypted option below for confidential evidence.
                Local backups do not sync or automatically recover after refresh. Encryption protects
                the backup contents at rest, but does NOT prove its author or authenticate who supplied the source files.
              </p>
              <p className="text-xs text-slate-400">
                Version 1 JSON · maximum {(MAX_CORPUS_WORKSPACE_BYTES / 1024 / 1024).toLocaleString()} MiB.
                Imports do not trust cached search hits, selected evidence, or AI responses:
                run a fresh search after restoration.
              </p>
              <section aria-label="Encrypted local evidence backup" className="space-y-3 rounded-lg border border-emerald-400/25 p-3">
                <h4 className="font-semibold text-white">Encrypted backup · recommended for private evidence</h4>
                <p className="text-xs text-slate-300">
                  AES-256-GCM with a fresh random salt and nonce, and {ENCRYPTED_CORPUS_ITERATIONS.toLocaleString()}
                  {" "}PBKDF2-SHA-256 iterations. No passphrase or document data is uploaded.
                  File contents, names and search settings are encrypted, but file size remains observable.
                  Use a unique strong passphrase, not just the 12-character minimum.
                  <strong> If you lose the passphrase, there is no recovery.</strong>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="corpus-encrypted-export-password" className="block space-y-2 text-xs text-slate-300">
                    <span>New passphrase (12–256 characters)</span>
                    <input id="corpus-encrypted-export-password" type="password"
                      autoComplete="new-password" value={encryptedExportPassword}
                      maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                      onChange={e => setEncryptedExportPassword(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                  </label>
                  <label htmlFor="corpus-encrypted-export-confirm" className="block space-y-2 text-xs text-slate-300">
                    <span>Confirm passphrase</span>
                    <input id="corpus-encrypted-export-confirm" type="password"
                      autoComplete="new-password" value={encryptedExportConfirm}
                      maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                      onChange={e => setEncryptedExportConfirm(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                  </label>
                </div>
                <Button type="button" onClick={() => void exportEncryptedCorpusWorkspace()}
                  disabled={corpusBusy || corpusWorkspaceLoading || corpusWorkspaceExporting ||
                    !encryptedExportPassword || !encryptedExportConfirm}>
                  {corpusWorkspaceExporting ? "Encrypting locally…" : "Export password-encrypted backup (.json)"}
                </Button>
                <label htmlFor="corpus-encrypted-import-password" className="block space-y-2 text-xs text-slate-300">
                  <span>Passphrase for an existing encrypted backup</span>
                  <input id="corpus-encrypted-import-password" type="password"
                    autoComplete="off" value={encryptedImportPassword}
                    maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                    onChange={e => {
                      ++corpusWorkspaceEpoch.current;
                      setPendingCorpusWorkspace(null);
                      setPendingCorpusEncrypted(false);
                      setCorpusWorkspaceLoading(false);
                      setCorpusWorkspaceError(null);
                      setEncryptedImportPassword(e.target.value);
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                </label>
                <label htmlFor="corpus-encrypted-import-file" className="block space-y-2 text-xs text-slate-300">
                  <span>Select encrypted ETERNYX JSON file (up to {(MAX_ENCRYPTED_CORPUS_BYTES / (1024 * 1024)).toFixed(2)} MiB)</span>
                  <input id="corpus-encrypted-import-file" type="file"
                    accept=".json,application/json"
                    disabled={corpusBusy || corpusWorkspaceLoading || corpusWorkspaceExporting || !encryptedImportPassword}
                    onChange={e => {
                      void previewEncryptedCorpusWorkspace(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                    className="block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-2 file:py-1 file:text-white"/>
                </label>
                <p className="text-xs text-slate-400">Entering the passphrase and choosing a file only decrypts locally for a preview. Replacing your workspace still requires separate confirmation. Passphrase fields are cleared after use.</p>
              </section>
              <section aria-label="Rotate encrypted backup passphrase" className="space-y-3 rounded-lg border border-cyan-500/25 p-3">
                <h4 className="font-semibold text-white">Rotate passphrase on an existing encrypted backup</h4>
                <p className="text-xs text-slate-300">
                  Decrypts the selected encrypted file locally using its current passphrase, validates all
                  documents and SHA-256 values, then immediately re-encrypts with a different new passphrase,
                  fresh random salt and nonce. No plaintext file is downloaded or sent to a server.
                  The original encrypted file is not deleted or overwritten.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label htmlFor="corpus-rotation-old" className="space-y-1 text-xs text-slate-300">
                    <span>Current passphrase</span>
                    <input id="corpus-rotation-old" type="password" autoComplete="off"
                      value={rotateOldPassword} maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                      onChange={e => setRotateOldPassword(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                  </label>
                  <label htmlFor="corpus-rotation-new" className="space-y-1 text-xs text-slate-300">
                    <span>New unique passphrase</span>
                    <input id="corpus-rotation-new" type="password" autoComplete="new-password"
                      value={rotateNewPassword} maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                      onChange={e => setRotateNewPassword(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                  </label>
                  <label htmlFor="corpus-rotation-confirm" className="space-y-1 text-xs text-slate-300">
                    <span>Confirm new passphrase</span>
                    <input id="corpus-rotation-confirm" type="password" autoComplete="new-password"
                      value={rotateConfirmPassword} maxLength={MAX_ENCRYPTED_CORPUS_PASSWORD}
                      onChange={e => setRotateConfirmPassword(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 p-2 text-white"/>
                  </label>
                </div>
                <label htmlFor="corpus-rotation-file" className="block space-y-1 text-xs text-slate-300">
                  <span>Choose existing encrypted JSON to re-encrypt (replaces no live workspace data)</span>
                  <input id="corpus-rotation-file" type="file" accept=".json,application/json"
                    disabled={corpusBusy || corpusWorkspaceLoading || corpusWorkspaceExporting ||
                      !rotateOldPassword || !rotateNewPassword || !rotateConfirmPassword}
                    onChange={e => {
                      void rotateEncryptedBackup(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                    className="block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-2 file:py-1 file:text-white"/>
                </label>
                <p className="text-xs text-amber-200">
                  Verify the newly downloaded backup with its new passphrase before manually deleting
                  the old file. Rotating one copy cannot revoke other copies or recover a lost passphrase.
                </p>
              </section>
              <section aria-label="Legacy plaintext local evidence backup" className="space-y-3 rounded-lg border border-amber-500/20 p-3">
                <h4 className="font-semibold text-white">Legacy plaintext backup · unencrypted</h4>
                <p className="text-xs text-amber-200">This compatibility format exposes full document text, filenames, search terms and questions to anyone who obtains the file. It is not encrypted.</p>
                <Button type="button" variant="outline"
                  disabled={corpusBusy || corpusWorkspaceLoading || corpusWorkspaceExporting}
                  onClick={() => void exportLocalCorpusWorkspace()}>
                  {corpusWorkspaceExporting ? "Creating local backup…" : "Export full local evidence workspace (.json, UNENCRYPTED)"}
                </Button>
              </section>
              <label htmlFor="document-corpus-workspace-file" className="block space-y-2 text-sm text-slate-300">
                <span>Choose ETERNYX local workspace backup JSON · review before replacement</span>
                <input id="document-corpus-workspace-file" type="file" accept=".json,application/json"
                  disabled={corpusBusy || corpusWorkspaceExporting || corpusWorkspaceLoading}
                  onChange={e => {
                    void previewCorpusWorkspace(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-700 file:px-3 file:py-1 file:text-white"
                />
              </label>
              {corpusWorkspaceLoading && <p role="status" className="text-xs text-cyan-200">
                Checking format, document caps and every SHA-256 locally… The current files are unchanged.
              </p>}
              {pendingCorpusWorkspace && (
                <section aria-label="Verified import preview, not yet applied"
                  className="space-y-2 rounded-lg border border-cyan-400/30 p-3">
                  <Badge variant="outline">
                    {pendingCorpusEncrypted ? "AES-256-GCM authenticated" : "Unencrypted plaintext"}
                    {" "}· version {pendingCorpusWorkspace.version} · SHA-256 checked · not restored
                  </Badge>
                  <p className="text-sm text-slate-200">
                    Backup: {pendingCorpusWorkspace.documents.length} files,
                    {" "}{pendingCorpusWorkspace.documents.reduce((sum, doc) => sum + doc.text.length, 0).toLocaleString()} decoded characters.
                    {" "}Current workspace: {corpusFiles.length} files.
                  </p>
                  <p className="text-xs text-slate-400">
                    Restored mode: {pendingCorpusWorkspace.mode}; saved query:
                    {" "}{pendingCorpusWorkspace.query || "(empty)"}. Matching excerpts and AI results are NOT restored.
                  </p>
                  {pendingCorpusReview && (
                    <section aria-label="Local before-restore change preview" className="space-y-2 rounded-lg border border-slate-700 p-3">
                      <h4 className="text-sm font-semibold text-white">Exactly what replacement changes</h4>
                      <p className="text-xs text-slate-300">
                        {pendingCorpusReview.counts.added} added · {pendingCorpusReview.counts.removed} removed ·
                        {" "}{pendingCorpusReview.counts["content-changed"]} text changed ·
                        {" "}{pendingCorpusReview.counts["metadata-changed"]} filename/type changed ·
                        {" "}{pendingCorpusReview.counts.unchanged} unchanged
                      </p>
                      <p className="text-xs text-slate-400">
                        Search term changed: {pendingCorpusReview.changedSettings.query ? "yes" : "no"};
                        {" "}match mode: {pendingCorpusReview.changedSettings.mode ? "yes" : "no"};
                        {" "}source filter: {pendingCorpusReview.changedSettings.sourceFilter ? "yes" : "no"};
                        {" "}AI question: {pendingCorpusReview.changedSettings.question ? "yes" : "no"}.
                        The report never copies these values.
                      </p>
                      {pendingCorpusReview.counts.removed > 0 && <p role="alert" className="text-xs text-amber-200">
                        Warning: {pendingCorpusReview.counts.removed} current source(s) will disappear from this
                        in-memory workspace if you confirm replacement.
                      </p>}
                      {pendingCorpusReview.counts["content-changed"] > 0 && <p role="alert" className="text-xs text-amber-200">
                        Warning: {pendingCorpusReview.counts["content-changed"]} existing source text(s) will be overwritten.
                        Make your own backup first if you want to keep the current version.
                      </p>}
                      {!pendingCorpusReview.replacementHasEffects && <p role="status" className="text-xs text-emerald-200">
                        Source contents, metadata, and saved search settings are already identical. No replacement needed.
                      </p>}
                      <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-300">
                        {pendingCorpusReview.changes.map(change => (
                          <li key={change.id} className="break-words">
                            {change.status.toUpperCase()} · {change.name} ·
                            {" "}{change.oldChars.toLocaleString()} → {change.newChars.toLocaleString()} characters
                            {change.beforeName && change.afterName && change.beforeName !== change.afterName
                              ? " · renamed from " + change.beforeName : ""}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-slate-400">{pendingCorpusReview.warning}</p>
                      <Button type="button" variant="outline" onClick={() => void copy(
                        formatPrivateCorpusImportReview(pendingCorpusReview),
                        "Privacy-safe backup change summary",
                      )}>
                        Copy privacy-safe change report (counts only)
                      </Button>
                    </section>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={restoreCorpusWorkspace}
                      disabled={corpusBusy || corpusWorkspaceLoading || corpusWorkspaceExporting ||
                        !pendingCorpusReview?.replacementHasEffects}>
                      Confirm replacement with validated backup
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                      invalidateCorpusWorkspace();
                      setCorpusWorkspaceNotice("Import cancelled. Existing local documents remain unchanged.");
                    }}>Cancel backup import</Button>
                  </div>
                  <Button type="button" variant="outline"
                    onClick={() => void copy(formatCorpusWorkspaceInventory(pendingCorpusWorkspace), "Verified backup inventory")}>
                    Copy manifest without full document contents
                  </Button>
                </section>
              )}
              {corpusWorkspaceError && <Alert role="alert" variant="destructive">
                <XCircle className="h-4 w-4"/><AlertDescription>{corpusWorkspaceError}</AlertDescription>
              </Alert>}
              {corpusWorkspaceNotice && <Alert role="status" aria-live="polite">
                <ShieldCheck className="h-4 w-4"/><AlertDescription>{corpusWorkspaceNotice}</AlertDescription>
              </Alert>}
            </section>
            {corpusBusy && <p role="status" className="text-xs text-cyan-200">
              Reading and validating text files locally… No partial batch will be added.
            </p>}
            <ul className="space-y-2">
              {corpusFiles.map(file => (
                <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                  <span className="break-all">{file.name} · {file.kind.toUpperCase()} · {file.text.length.toLocaleString()} characters</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => removeCorpusFile(file.id)}>
                    <Trash2 className="mr-1 h-3 w-3" />Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="document-corpus-query" className="block space-y-2 text-sm text-slate-300">
                <span>Keyword query · up to eight words, 120 characters</span>
                <input id="document-corpus-query" value={corpusQuery} maxLength={120}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && corpusFiles.length && !corpusBusy) runCorpusSearch();
                  }}
                  onChange={e => { invalidateCorpusWorkspace(); setCorpusQuery(e.target.value); invalidateCorpus(); }}
                  placeholder="e.g. coating inspection"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" />
              </label>
              <label htmlFor="document-corpus-mode" className="block space-y-2 text-sm text-slate-300">
                <span>Keyword matching</span>
                <select id="document-corpus-mode" value={corpusMode}
                  onChange={e => { invalidateCorpusWorkspace(); setCorpusMode(e.target.value as CorpusMatchMode); invalidateCorpus(); }}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                  <option value="all">All query words on the same line</option>
                  <option value="any">Any query word on the line</option>
                  <option value="phrase">Exact consecutive words in query order</option>
                  <option value="near">All words within three intervening words</option>
                </select>
              </label>
            </div>
            <label htmlFor="document-corpus-filter" className="block space-y-2 text-sm text-slate-300">
              <span>Optional local file filter</span>
              <select id="document-corpus-filter" value={corpusFilter}
                onChange={e => { invalidateCorpusWorkspace(); setCorpusFilter(e.target.value); invalidateCorpus(); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white">
                <option value="">Search all loaded files</option>
                {corpusFiles.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={runCorpusSearch}
                disabled={!corpusFiles.length || !corpusQuery.trim() || corpusBusy}>
                <ScanSearch className="mr-2 h-4 w-4"/>Search loaded files locally
              </Button>
              <Button type="button" variant="outline" onClick={clearCorpus}
                disabled={!corpusFiles.length && !corpusResults}>
                Clear local evidence collection
              </Button>
              <Button type="button" variant="outline" onClick={() => void generateCorpusFingerprints()}
                disabled={!corpusFiles.length || corpusBusy || corpusHashBusy}>
                <ShieldCheck className="mr-2 h-4 w-4"/>
                {corpusHashBusy ? "Hashing local decoded text…" : "Calculate local SHA-256 fingerprints"}
              </Button>
            </div>
            {corpusFingerprints && (
              <section aria-label="Local decoded text fingerprints" className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="text-xs text-amber-200">
                  These are SHA-256 hashes of UTF-8 encoding of the decoded in-memory text,
                  NOT necessarily the original uploaded file bytes. They do not authenticate
                  the author, the uploaded source, or the claims inside it.
                </p>
                <ul className="space-y-1 text-xs text-slate-300">
                  {corpusFingerprints.map(item => (
                    <li key={item.id} className="break-all">
                      {item.fileName} · <code>{item.sha256OfDecodedTextUtf8}</code>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" onClick={downloadCorpusFingerprints}>
                  Download complete local SHA-256 manifest (.txt)
                </Button>
              </section>
            )}
            {corpusResults && (
              <section aria-label="Local multi-document evidence results" className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Source-derived keyword matches · not AI</Badge>
                <p role="status" className="text-sm text-slate-300">
                  {corpusResults.totalHits} matching source lines from {corpusResults.searchedFiles} file(s).
                  {" "}Sorted by explicitly defined lexical matching and frequency scores.
                </p>
                <p className="text-xs text-slate-400">{corpusResults.caveat}</p>
                {corpusCoverage && (
                  <section aria-label="Per-source keyword evidence coverage"
                    className="space-y-2 rounded-lg border border-slate-800 p-3">
                    <p className="text-sm text-slate-200">
                      {corpusCoverage.filesWithMatches} of {corpusCoverage.totalFiles} searched files have matching lines.
                      This is not evidence that those sources agree or are trustworthy.
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-300">
                      {corpusCoverage.rows.map(row => (
                        <li key={row.fileId} className="break-words">
                          {row.fileName}: {row.matchingLines} matching lines ·
                          {" "}{row.matchedTerms.length ? row.matchedTerms.join(", ") : "no matching query terms"}
                        </li>
                      ))}
                    </ul>
                    <Button type="button" variant="outline"
                      onClick={() => void copy(formatCorpusCoverage(corpusCoverage), "Local source coverage")}>
                      Copy full source coverage report
                    </Button>
                  </section>
                )}
                {corpusResults.hits.length > MAX_CORPUS_PREVIEW && <p className="text-xs text-amber-200">
                  Previewing the first {MAX_CORPUS_PREVIEW} of {corpusResults.totalHits} source lines.
                  The full local TXT/JSON downloads include every matched line and location.
                </p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void copy(formatCorpusSearch(corpusResults), "Complete local evidence")}>
                    <ClipboardCopy className="mr-2 h-4 w-4"/>Copy full result report
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadCorpusResults("txt")}>
                    Download all evidence (.txt)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => downloadCorpusResults("json")}>
                    Download all evidence (.json)
                  </Button>
                </div>
                <ul className="max-h-96 space-y-3 overflow-y-auto">
                  {corpusResults.hits.slice(0, MAX_CORPUS_PREVIEW).map(hit => (
                    <li key={hit.id} className="rounded-lg border border-slate-800 p-3 text-sm text-slate-200">
                      <label className="flex items-start gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={corpusSelectedIds.includes(hit.id)}
                          disabled={!corpusSelectedIds.includes(hit.id) &&
                            corpusSelectedIds.length >= MAX_CORPUS_AI_EVIDENCE}
                          onChange={e => toggleCorpusHit(hit.id, e.target.checked)} className="mt-1"/>
                        <span>Use this exact excerpt for optional AI explanation</span>
                      </label>
                      <p className="mt-2 break-all text-xs font-semibold text-cyan-200">
                        {hit.documentName} · line {hit.line} · column {hit.snippetStartColumn}
                        {" "}· keyword score {hit.score}
                      </p>
                      {hit.partial && <p className="mt-1 text-xs text-amber-200">
                        Partial line excerpt · original source line contains {hit.sourceLineLength} characters.
                      </p>}
                      <p className="mt-1 text-xs text-slate-400">
                        Exact matching words: {hit.matchedTerms.join(", ")} · occurrences {hit.frequency}
                        {hit.matchSpan && (
                          <> · matched span columns {hit.matchSpan.startColumn}–{hit.matchSpan.endColumn}</>
                        )}
                      </p>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-200">{hit.snippet}</pre>
                      <Button type="button" variant="outline" size="sm"
                        onClick={() => reviewCorpusHit(hit.id)}>
                        Review original source ±2 lines
                      </Button>
                    </li>
                  ))}
                </ul>
                {corpusContext && (
                  <section aria-label="Verified current source context" className="space-y-2 rounded-lg border border-cyan-400/20 p-3">
                    <p className="text-sm font-semibold text-white">
                      {corpusContext.fileName} · selected line {corpusContext.centerLine}
                    </p>
                    <p className="text-xs text-amber-200">{corpusContext.caveat}</p>
                    <ul className="max-h-56 space-y-2 overflow-auto">
                      {corpusContext.lines.map(line => (
                        <li key={line.line}
                          className={line.selected ? "rounded border border-cyan-400/40 p-2" : "rounded border border-slate-700 p-2"}>
                          <p className="text-xs text-slate-400">
                            Source line {line.line}, column {line.startColumn}
                            {line.partial && <> · PARTIAL · original line length {line.sourceLength}</>}
                          </p>
                          <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-200">{line.snippet}</pre>
                        </li>
                      ))}
                    </ul>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCorpusContext(null)}>
                      Close source context
                    </Button>
                  </section>
                )}
                <section aria-label="Optional AI local evidence explanation" className="space-y-3 rounded-lg border border-violet-400/20 p-4">
                  <h3 className="font-semibold text-white">Explain selected evidence with AI Chat · optional</h3>
                  <p className="text-sm text-slate-400">
                    Select 1–{MAX_CORPUS_AI_EVIDENCE} excerpts from the visible results.
                    Only an explicit click sends the full selected excerpts with source labels and line numbers
                    to the existing authenticated AI Chat provider. It may use ai.chat credits,
                    save history, and process data externally. No source verification or independent web search is performed.
                    Oversized requests fail without silent truncation. Check privacy carefully before submission.
                  </p>
                  <label htmlFor="document-corpus-ai-question" className="block space-y-2 text-sm text-slate-300">
                    <span>Optional evidence question · maximum 250 characters</span>
                    <input id="document-corpus-ai-question" value={corpusQuestion} maxLength={250}
                      onChange={e => { invalidateCorpusWorkspace(); setCorpusQuestion(e.target.value); corpusAI.invalidate(); }}
                      placeholder="Which lines support this conclusion?"
                      className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white"/>
                  </label>
                  <p className="text-xs text-slate-400">{corpusSelectedIds.length} / {MAX_CORPUS_AI_EVIDENCE} excerpts selected.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={!corpusSelectedIds.length}
                      onClick={() => void reviewSelectedCorpus(false)}>
                      Copy selected evidence with nearby source context
                    </Button>
                    <Button type="button" variant="outline" disabled={!corpusSelectedIds.length}
                      onClick={() => void reviewSelectedCorpus(true)}>
                      Download selected review (.txt)
                    </Button>
                  </div>
                  <p className="text-xs text-amber-200">
                    Before AI submission, selected lines are checked against the currently loaded source text.
                    The AI prompt still contains only the originally selected bounded excerpts, not hidden
                    surrounding context. A matching local quote does not authenticate the file.
                  </p>
                  <Button type="button" onClick={submitCorpusAI}
                    disabled={!corpusSelectedIds.length || corpusAI.loading}>
                    {corpusAI.loading ? "Explaining evidence…" : "Explain selected evidence with AI Chat"}
                  </Button>
                  {corpusAI.loading && <p role="status" className="text-xs text-cyan-200">
                    AI request in progress. Editing search inputs hides stale results but cannot cancel a submitted credit charge.
                  </p>}
                  {corpusAI.error && <Alert role="alert" variant="destructive">
                    <XCircle className="h-4 w-4"/><AlertDescription>{corpusAI.error}</AlertDescription>
                  </Alert>}
                  {corpusAI.result && <div className="space-y-2">
                    <Badge variant="outline">AI-generated interpretation · source lines unverified</Badge>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{corpusAI.result}</pre>
                    <Button type="button" variant="outline" onClick={() => void copy(corpusAI.result!, "AI evidence interpretation")}>
                      <ClipboardCopy className="mr-2 h-4 w-4"/>Copy AI interpretation
                    </Button>
                  </div>}
                </section>
              </section>
            )}
            {corpusError && <Alert role="alert" variant="destructive">
              <XCircle className="h-4 w-4"/><AlertDescription>{corpusError}</AlertDescription>
            </Alert>}
            {corpusNotice && <Alert role="status" aria-live="polite">
              <ShieldCheck className="h-4 w-4"/><AlertDescription>{corpusNotice}</AlertDescription>
            </Alert>}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">Local text search</CardTitle><CardDescription className="text-slate-400">Search source lines exactly; results are not AI answers.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="document-search" className="block space-y-2 text-sm text-slate-300">
              <span>Find text · maximum 100 characters</span>
              <input onKeyDown={event => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && source.trim() && searchTerm.trim() && !loading) search();
              }} id="document-search" value={searchTerm} maxLength={100} onChange={e => { setSearchTerm(e.target.value); setSearchResults(null); setError(null); }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Enter a keyword or phrase…" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={caseSensitive} onChange={e => { setCaseSensitive(e.target.checked); setSearchResults(null); }} />
              Case-sensitive search
            </label>
            <Button type="button" onClick={search} disabled={!source.trim() || !searchTerm.trim() || loading}>
              <ScanSearch className="mr-2 h-4 w-4" />Search document
            </Button>
            {searchResults && (
              <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <p role="status" className="text-sm text-slate-300">{searchResults.total} text matches for "{searchResults.query}"</p>
                {searchResults.truncated && <p className="text-xs text-amber-200">Displaying only the first 50 matches.</p>}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => downloadMatches("json")}>Download matches (.json)</Button>
                  <Button type="button" variant="outline" onClick={() => downloadMatches("txt")}>Download matches (.txt)</Button></div>
                <ul className="max-h-72 space-y-2 overflow-auto text-sm text-slate-300">
                  {searchResults.matches.map((match, i) => (
                    <li key={i} className="border-b border-slate-800 pb-2">
                      <button type="button" className="min-h-11 rounded px-1 text-xs text-cyan-200 underline underline-offset-4 focus-visible:ring-2"
                        onClick={() => {
                          sourceField.current?.focus();
                          sourceField.current?.setSelectionRange(match.sourceOffset, match.sourceOffset + match.length);
                        }}>Go to line {match.line}, column {match.column}</button>
                      <p className="whitespace-pre-wrap break-words">{match.excerpt.slice(0, match.excerptOffset)}<mark className="rounded-sm bg-amber-200 px-0.5 text-slate-950">{match.excerpt.slice(match.excerptOffset, match.excerptOffset + match.length)}</mark>{match.excerpt.slice(match.excerptOffset + match.length)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader><CardTitle className="text-white">Document analysis request</CardTitle><CardDescription className="text-slate-400">Prepare a local request, then optionally submit a bounded excerpt for AI analysis using existing chat credits.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div role="group" aria-label="Document request type" className="flex flex-wrap gap-2">
              <Button type="button" variant={task === "analyze" ? "default" : "outline"} aria-pressed={task === "analyze"}
                onClick={() => { setTask("analyze"); setDraft(null); ai.invalidate(); }}>Analyze</Button>
              <Button type="button" variant={task === "extract" ? "default" : "outline"} aria-pressed={task === "extract"}
                onClick={() => { setTask("extract"); setDraft(null); ai.invalidate(); }}>Extract fields</Button>
            </div>
            <label htmlFor="document-instruction" className="block space-y-2 text-sm text-slate-300">
              <span>{task === "extract" ? "Fields to extract · required" : "Question or analysis instructions · optional"} (max 1,000 characters)</span>
              <textarea id="document-instruction" value={instruction} maxLength={1000} rows={3}
                onChange={e => { setInstruction(e.target.value); setDraft(null); ai.invalidate(); }}
                placeholder={task === "extract" ? "For example: title, date, total, supplier" : "For example: identify key points and unresolved questions"}
                className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-500" />
            </label>
            <Button type="button" onClick={prepare} disabled={!source.trim() || loading || (task === "extract" && !instruction.trim())}>
              <FileCheck2 className="mr-2 h-4 w-4" />Prepare local request
            </Button>
            {draft && (
              <div className="space-y-2 rounded-lg border border-cyan-400/20 bg-slate-950 p-4">
                <Badge variant="outline">Local only · no AI result</Badge>
                <p className="text-xs text-slate-400">Feature: {draft.featureKey}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-300">{formatDocumentDraft(draft)}</pre>
                <Button type="button" variant="outline" onClick={() => copy(formatDocumentDraft(draft), "Document request")}>
                  <ClipboardCopy className="mr-2 h-4 w-4" />Copy request
                </Button>
              </div>
            )}
            <section className="space-y-3 rounded-xl border border-violet-400/20 bg-slate-950 p-4" aria-label="Optional document AI analysis">
              <h3 className="font-semibold text-white">Analyze the selected text with ETERNYX AI</h3>
              <p className="text-sm text-slate-400">
                Only an explicit click sends your {aiPassage ? "highlighted excerpt" : "full document text"} to the
                existing AI Chat provider. Credit usage, saved chat history, and possible external processing apply.
                The 4,000-character total request limit is enforced before any network call.
                Output is not a verified extraction or factual guarantee.
              </p>
              <Button type="button" disabled={!source.trim() || loading || ai.loading || (task === "extract" && !instruction.trim())} onClick={askAI}>
                <FileSearch className="mr-2 h-4 w-4" />{ai.loading ? "Analyzing with AI…" : "Analyze with AI Chat"}
              </Button>
              {ai.loading && <p role="status" className="text-xs text-cyan-200">Request in progress. Changing input hides the old response but does not cancel a submitted credit charge.</p>}
              {ai.error && <Alert role="alert" variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>{ai.error}</AlertDescription></Alert>}
              {ai.result && (
                <div className="space-y-3">
                  <Badge variant="outline">AI-generated · check against source text</Badge>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 p-3 text-sm text-slate-200">{ai.result}</pre>
                  <Button type="button" variant="outline" onClick={copyAIResult}><ClipboardCopy className="mr-2 h-4 w-4" />Copy AI analysis</Button>
                </div>
              )}
            </section>
          </CardContent>
        </Card>
        <section className="grid gap-4 md:grid-cols-2">
          {features.map(feature => (
            <Card key={feature.id} className="border-slate-800 bg-slate-900/60 text-slate-100">
              <CardHeader>
                <CardTitle className="text-white">{feature.title}</CardTitle>
                <CardDescription className="text-slate-400">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent><Badge variant="outline">Dedicated backend planned · opt-in AI Chat text bridge available by entitlement</Badge></CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
};
export default AIDocumentIntelligence;
