const prefix = "eternyx.workspace.saved-note.";

export function saveCopy(storage, id, title, body, savedAt) {
  const name = title.trim();
  if (!name || name.length > 100 || !body.trim()) throw new Error("Enter a title and note before saving a copy.");
  const record = { title: name, body, savedAt };
  storage.setItem(prefix + id, JSON.stringify(record));
}

export function readCopies(storage) {
  const notes = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    let record;
    try { record = JSON.parse(storage.getItem(key)); } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (typeof record?.title === "string" && typeof record.body === "string" && Number.isFinite(record.savedAt)) {
      notes.push({ ...record, id: key.slice(prefix.length) });
    }
  }
  return notes.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
}

export function matchingCopies(notes, search) {
  const query = search.trim().toLowerCase();
  return notes.filter(note => (note.title + "\n" + note.body).toLowerCase().includes(query));
}

export function deleteCopy(storage, id) {
  storage.removeItem(prefix + id);
}

export function suggestedTitle(body) {
  const line = body.trimStart().split(/\r\n|[\r\n]/, 1)[0].trim();
  return line.slice(0, 100).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
}

export function noteExcerpt(body, search) {
  const text = body.replace(/\s+/gu, " ").trim();
  const query = search.trim().replace(/\s+/gu, " ");
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  const start = Math.max(0, index - 28);
  const end = Math.min(text.length, start + 120);
  return (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
