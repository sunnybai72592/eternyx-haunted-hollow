const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function renderMarkdownSafe(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let listType = null;
  const closeList = () => {
    if (listType) output.push(listType === "ul" ? "</ul>" : "</ol>");
    listType = null;
  };
  const inline = (text) => {
    let safe = escapeHtml(text);
    safe = safe.replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return safe;
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(nextType === "ul" ? "<ul>" : "<ol>");
      }
      output.push(`<li>${inline((unordered || ordered)[1])}</li>`);
    } else {
      closeList();
      if (line.trim()) output.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return output.join("\n");
}

export function jsonArrayToCsv(input) {
  const rows = JSON.parse(input);
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("Input must be a JSON array of objects.");
  }
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (typeof value === "string" && /^[\\s]*[=+@-]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows.map((row) => columns.map((key) => row[key]))]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

const htmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function encodeHtmlEntities(input) {
  return String(input).replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

export function decodeHtmlEntities(input) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return String(input).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const hex = entity[1].toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "\uFFFD";
    return String.fromCodePoint(codePoint);
  });
}

export function convertTimestamp(input) {
  const value = String(input).trim();
  if (!value) throw new Error("Enter a Unix timestamp or date.");
  let milliseconds;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error("Timestamp is outside the supported range.");
    milliseconds = Math.abs(numeric) >= 1e11 ? numeric : numeric * 1000;
  } else {
    milliseconds = Date.parse(value);
  }
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new Error("Enter a valid timestamp or date.");
  return {
    iso: date.toISOString(),
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMilliseconds: date.getTime(),
    utc: date.toUTCString(),
  };
}

export function createLineDiff(original, revised) {
  const left = String(original).replace(/\r\n?/g, "\n").split("\n");
  const right = String(revised).replace(/\r\n?/g, "\n").split("\n");
  if (left.length > 300 || right.length > 300) throw new Error("For performance, compare up to 300 lines at a time.");
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) result.push({ type: "same", value: left[i++] }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) result.push({ type: "removed", value: left[i++] });
    else result.push({ type: "added", value: right[j++] });
  }
  while (i < left.length) result.push({ type: "removed", value: left[i++] });
  while (j < right.length) result.push({ type: "added", value: right[j++] });
  return result;
}
