/** Pure presentation helpers for the ETERNYX Education Hub. */
export function normalizeEducationTest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { id, title, description, duration_minutes, created_at, is_active } = raw;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) ||
      typeof title !== "string" || !title.trim() ||
      is_active !== true || !Number.isInteger(duration_minutes) ||
      duration_minutes < 1 || duration_minutes > 1440) return null;
  return {
    id, title: title.trim(), description: typeof description === "string" ? description.trim() : "",
    duration_minutes,
    created_at: typeof created_at === "string" ? created_at : "",
    is_active: true,
  };
}

export function filterEducationTests(tests, search = "", order = "newest") {
  const query = String(search).slice(0, 120).trim().toLocaleLowerCase();
  const results = tests.filter(test =>
    !query || [test.title, test.description].some(value => value.toLocaleLowerCase().includes(query))
  );
  const sorted = [...results];
  if (order === "title") sorted.sort((a,b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  else if (order === "shortest") sorted.sort((a,b) => a.duration_minutes - b.duration_minutes || a.title.localeCompare(b.title));
  else sorted.sort((a,b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || a.title.localeCompare(b.title));
  return sorted;
}
