export function normalizeGitHubState(value) {
  if (value === "open" || value === "closed" || value === "all") return value;
  throw new Error("Choose open, closed, or all.");
}

export function filterGitHubItems(items, query) {
  const term = String(query ?? "").trim().toLowerCase();
  if (!term) return items;
  return items.filter((item) => [
    item.title,
    item.body,
    item.user?.login,
    ...(item.labels ?? []).map((label) => typeof label === "string" ? label : label.name),
    ...(item.assignees ?? []).map((assignee) => assignee.login),
  ].filter(Boolean).join(" ").toLowerCase().includes(term));
}

export function formatGitHubItemNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid GitHub item number.");
  return "#" + value;
}
