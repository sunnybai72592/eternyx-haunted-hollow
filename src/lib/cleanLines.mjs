export function cleanLines(source, { deduplicate = true, ignoreCase = false, order = "input" } = {}) {
  const lines = [];
  const seen = new Set();
  let blanks = 0;
  let duplicates = 0;
  let trimmed = 0;
  const input = source ? source.split(/\r\n|[\r\n]/) : [];
  for (const raw of input) {
    const line = raw.trim();
    if (!line) { blanks++; continue; }
    if (raw !== line) trimmed++;
    if (deduplicate) {
      const key = ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
    }
    lines.push(line);
  }
  if (order === "ascending") lines.sort((a, b) => a.localeCompare(b));
  if (order === "descending") lines.sort((a, b) => b.localeCompare(a));
  return { lines, blanks, duplicates, trimmed };
}
