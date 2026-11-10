const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function normalizeGitHubReleases(payload) {
  if (!payload || !Array.isArray(payload)) return [];
  return payload.filter((item) =>
    item && Number.isSafeInteger(item.id) && item.id > 0 &&
    typeof item.tag_name === "string" && item.tag_name.length > 0 &&
    typeof item.html_url === "string" && /^https:\/\/github\.com\//.test(item.html_url)
  ).map((item) => ({
    id: item.id,
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : item.tag_name,
    tag_name: item.tag_name,
    target_commitish: typeof item.target_commitish === "string" ? item.target_commitish : "",
    body: typeof item.body === "string" ? item.body : "",
    draft: item.draft === true,
    prerelease: item.prerelease === true,
    created_at: validDate(item.created_at) ? item.created_at : null,
    published_at: validDate(item.published_at) ? item.published_at : null,
    html_url: item.html_url,
    author: item.author && typeof item.author.login === "string" ? item.author.login : "Unknown",
    assets: Array.isArray(item.assets) ? item.assets.filter((asset) =>
      asset && Number.isSafeInteger(asset.id) && typeof asset.name === "string" &&
      typeof asset.browser_download_url === "string" && /^https:\/\//.test(asset.browser_download_url)
    ).map((asset) => ({
      id: asset.id, name: asset.name, size: Number.isFinite(asset.size) && asset.size >= 0 ? asset.size : 0,
      download_count: Number.isSafeInteger(asset.download_count) && asset.download_count >= 0 ? asset.download_count : 0,
      content_type: typeof asset.content_type === "string" ? asset.content_type : "Unknown",
      browser_download_url: asset.browser_download_url
    })) : []
  }));
}

export function normalizeGitHubTags(payload) {
  if (!payload || !Array.isArray(payload)) return [];
  return payload.filter((item) => item && typeof item.name === "string" && item.name.length > 0 &&
    item.commit && typeof item.commit.sha === "string" && /^[a-f0-9]{40}$/i.test(item.commit.sha)
  ).map((item) => ({ name: item.name, sha: item.commit.sha, url: typeof item.commit.url === "string" ? item.commit.url : "" }));
}

export function filterGitHubReleases(releases, { query = "", channel = "all" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return releases.filter((release) => {
    const matchesQuery = !needle || [release.name, release.tag_name, release.body, release.author].some((value) => String(value || "").toLowerCase().includes(needle));
    const matchesChannel = channel === "all" || (channel === "stable" && !release.prerelease && !release.draft) ||
      (channel === "prerelease" && release.prerelease) || (channel === "draft" && release.draft);
    return matchesQuery && matchesChannel;
  });
}

export function summarizeGitHubReleases(releases) {
  const published = releases.filter((release) => !release.draft && release.published_at);
  const stable = published.filter((release) => !release.prerelease);
  return {
    total: releases.length,
    stable: stable.length,
    prereleases: published.filter((release) => release.prerelease).length,
    drafts: releases.filter((release) => release.draft).length,
    latestStable: stable[0] || null,
    assets: releases.reduce((sum, release) => sum + release.assets.length, 0),
    downloads: releases.reduce((sum, release) => sum + release.assets.reduce((assetSum, asset) => assetSum + asset.download_count, 0), 0)
  };
}

export function formatGitHubAssetSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + " " + units[unit];
}

export function normalizeGitHubComparison(payload) {
  if (!payload || typeof payload !== "object") throw new Error("GitHub returned an invalid comparison response.");
  return {
    status: typeof payload.status === "string" ? payload.status : "unknown",
    ahead_by: Number.isSafeInteger(payload.ahead_by) ? payload.ahead_by : 0,
    behind_by: Number.isSafeInteger(payload.behind_by) ? payload.behind_by : 0,
    total_commits: Number.isSafeInteger(payload.total_commits) ? payload.total_commits : 0,
    files: Array.isArray(payload.files) ? payload.files.filter((file) => file && typeof file.filename === "string").map((file) => ({
      filename: file.filename,
      status: typeof file.status === "string" ? file.status : "modified",
      additions: Number.isSafeInteger(file.additions) ? file.additions : 0,
      deletions: Number.isSafeInteger(file.deletions) ? file.deletions : 0,
      changes: Number.isSafeInteger(file.changes) ? file.changes : 0,
      previous_filename: typeof file.previous_filename === "string" ? file.previous_filename : null
    })) : []
  };
}
