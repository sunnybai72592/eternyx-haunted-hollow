import { buildPlaygroundDocument } from "./eternyxLabs.mjs";

export const PROJECT_SCHEMA = "eternyx-developer-project-v1";
export const PROJECT_STORAGE_KEY = "eternyx:developer-projects:v1";
export const MAX_PROJECT_FILES = 12;
export const MAX_FILE_CHARS = 20000;
export const MAX_PROJECT_CHARS = 90000;
export const MAX_SAVED_PROJECTS = 5;
const ALLOWED_EXTENSIONS = new Set(["html", "css", "js", "json", "md", "txt"]);

export function checkProjectFileName(name) {
  if (typeof name !== "string" || name.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\.(html|css|js|json|md|txt)$/i.test(name) ||
    name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("File names must be simple names ending in .html, .css, .js, .json, .md or .txt (max 64 characters).");
  }
  const extension = name.split(".").at(-1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("Unsupported file type.");
  return name;
}

export function normalizeDeveloperProject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid project.");
  const id = typeof value.id === "string" && /^[a-z0-9-]{1,64}$/i.test(value.id) ? value.id : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 80) throw new Error("Project name must contain 1 to 80 characters.");
  if (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > MAX_PROJECT_FILES) {
    throw new Error("Projects must contain 1–12 files.");
  }
  const seen = new Set();
  let total = 0;
  const files = value.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error("Invalid project file.");
    const filename = checkProjectFileName(file.name);
    const key = filename.toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate file name: " + filename);
    seen.add(key);
    if (typeof file.content !== "string" || file.content.length > MAX_FILE_CHARS) {
      throw new Error("Each file is limited to 20,000 characters.");
    }
    total += file.content.length;
    return { name: filename, content: file.content };
  });
  if (total > MAX_PROJECT_CHARS) throw new Error("Project exceeds 90,000 characters.");
  return { id, name, files };
}

export function createDeveloperProject(template = "starter", id = "new-project") {
  const templates = {
    starter: [
      { name: "index.html", content: '<main class="panel"><h1>Build with ETERNYX</h1><p id="message">Try editing these files.</p><button id="hello">Say hello</button></main>' },
      { name: "styles.css", content: "body{background:#f0f5ff;font-family:system-ui,sans-serif;color:#12213c}.panel{max-width:540px;margin:40px auto;padding:30px;background:white;border-radius:16px;box-shadow:0 10px 30px #1e3a8a20}button{padding:10px 18px;border:0;border-radius:8px;background:#1d4ed8;color:white;cursor:pointer}" },
      { name: "app.js", content: 'document.querySelector("#hello")?.addEventListener("click",()=>{document.querySelector("#message").textContent="Hello from the isolated preview!";});' },
    ],
    landing: [
      { name: "index.html", content: '<main><h1>Simple landing page</h1><p>A lightweight, responsive page.</p><a href="#features">See features</a><section id="features"><h2>Features</h2><p>Update the text and styles to customize.</p></section></main>' },
      { name: "styles.css", content: "body{font:16px system-ui;color:#1f2937;margin:0;background:#e2e8f0}main{max-width:760px;margin:auto;padding:64px 24px}h1{font-size:clamp(2rem,6vw,4rem)}section{margin-top:70px;padding:24px;border-radius:16px;background:#fff}" },
    ],
    blank: [{ name: "index.html", content: "<main><h1>Untitled project</h1></main>" }],
  };
  if (!Object.hasOwn(templates, template)) throw new Error("Unknown project template.");
  return normalizeDeveloperProject({ id, name: template === "starter" ? "My first project" : template === "landing" ? "Landing page" : "Untitled project", files: templates[template] });
}

export function addDeveloperFile(project, name, content = "") {
  const valid = normalizeDeveloperProject(project);
  if (valid.files.length >= MAX_PROJECT_FILES) throw new Error("12-file limit reached.");
  return normalizeDeveloperProject({ ...valid, files: [...valid.files, { name, content }] });
}

export function editDeveloperFile(project, name, content) {
  const valid = normalizeDeveloperProject(project);
  if (!valid.files.some((file) => file.name === name)) throw new Error("File not found.");
  return normalizeDeveloperProject({ ...valid, files: valid.files.map((file) => file.name === name ? { ...file, content } : file) });
}

export function renameDeveloperFile(project, oldName, newName) {
  const valid = normalizeDeveloperProject(project);
  if (!valid.files.some((file) => file.name === oldName)) throw new Error("File not found.");
  return normalizeDeveloperProject({ ...valid, files: valid.files.map((file) => file.name === oldName ? { ...file, name: newName } : file) });
}

export function removeDeveloperFile(project, name) {
  const valid = normalizeDeveloperProject(project);
  if (valid.files.length === 1) throw new Error("A project needs at least one file.");
  if (!valid.files.some((file) => file.name === name)) throw new Error("File not found.");
  return normalizeDeveloperProject({ ...valid, files: valid.files.filter((file) => file.name !== name) });
}

export function checkDeveloperProject(project) {
  const valid = normalizeDeveloperProject(project);
  const findings = [];
  const entry = valid.files.find((file) => file.name.toLowerCase() === "index.html");
  if (!entry) findings.push({ level: "error", message: "An index.html entry file is required for preview." });
  else if (!entry.content.trim()) findings.push({ level: "warning", message: "index.html is empty." });
  for (const file of valid.files) {
    if (!file.name.toLowerCase().endsWith(".json")) continue;
    try { JSON.parse(file.content); }
    catch (cause) { findings.push({ level: "error", message: file.name + ": Invalid JSON (" + (cause instanceof Error ? cause.message.slice(0, 160) : "syntax error") + ")." }); }
  }
  if (valid.files.length >= MAX_PROJECT_FILES) findings.push({ level: "info", message: "The project has reached its 12-file limit." });
  return findings;
}

export function previewDeveloperProject(project) {
  const valid = normalizeDeveloperProject(project);
  const entry = valid.files.find((file) => file.name.toLowerCase() === "index.html");
  if (!entry) throw new Error("Create index.html before running a preview.");
  const css = valid.files.filter((file) => file.name.toLowerCase().endsWith(".css")).map((file) => file.content).join("\n");
  const js = valid.files.filter((file) => file.name.toLowerCase().endsWith(".js")).map((file) => file.content).join("\n;\n");
  // Security inherited from existing ETERNYX Labs preview: CSP plus iframe sandbox=allow-scripts
  return buildPlaygroundDocument({ html: entry.content, css, js });
}

export function exportDeveloperProject(project) {
  const valid = normalizeDeveloperProject(project);
  return JSON.stringify({ schema: PROJECT_SCHEMA, name: valid.name, files: valid.files }, null, 2);
}

export function importDeveloperProject(raw, newId) {
  if (typeof raw !== "string" || raw.length > 160_000) throw new Error("Import is too large.");
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Import is not valid JSON."); }
  if (!value || value.schema !== PROJECT_SCHEMA) throw new Error("Unsupported project export format.");
  return normalizeDeveloperProject({ id: newId, name: value.name, files: value.files });
}

export function normalizeSavedDeveloperProjects(value) {
  if (!Array.isArray(value)) return [];
  const saved = [];
  const ids = new Set();
  for (const item of value.slice(0, MAX_SAVED_PROJECTS)) {
    try {
      const valid = normalizeDeveloperProject(item);
      if (!valid.id || ids.has(valid.id)) continue;
      ids.add(valid.id);
      saved.push(valid);
    } catch { /* Broken browser data is not trusted. */ }
  }
  return saved;
}

export function saveDeveloperProject(collection, project) {
  const valid = normalizeDeveloperProject(project);
  if (!valid.id) throw new Error("Project needs a unique identifier.");
  const saved = normalizeSavedDeveloperProjects(collection);
  const index = saved.findIndex((item) => item.id === valid.id);
  if (index >= 0) return saved.map((item, i) => i === index ? valid : item);
  if (saved.length >= MAX_SAVED_PROJECTS) throw new Error("Maximum five saved projects; delete an old project first.");
  return [...saved, valid];
}
