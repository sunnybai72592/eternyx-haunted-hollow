const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;

export function parseGitHubRepositoryInput(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Enter a GitHub repository URL or owner/repository.");
  }

  const value = input.trim();
  let path = value;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw new Error("Enter a valid GitHub repository URL."); }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) {
      throw new Error("Only public HTTPS github.com repository URLs are supported.");
    }
    if (url.search || url.hash) throw new Error("Remove query parameters and fragments from the repository URL.");
    path = url.pathname.replace(/^\/+|\/+$/g, "");
  }

  path = path.replace(/\.git$/i, "");
  const parts = path.split("/");
  if (parts.length !== 2 || !OWNER.test(parts[0]) || !REPOSITORY.test(parts[1]) || parts[1] === "." || parts[1] === "..") {
    throw new Error("Use the format owner/repository or https://github.com/owner/repository.");
  }

  return { owner: parts[0], repository: parts[1], fullName: parts[0] + "/" + parts[1] };
}

export function githubApiUrl(owner, repository, resource = "") {
  const parsed = parseGitHubRepositoryInput(owner + "/" + repository);
  const suffix = String(resource).replace(/^\/+/, "");
  if (suffix.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Invalid GitHub API resource path.");
  }
  return "https://api.github.com/repos/" + encodeURIComponent(parsed.owner) + "/" +
    encodeURIComponent(parsed.repository) + (suffix ? "/" + suffix.split("/").map(encodeURIComponent).join("/") : "");
}
