/**
 * Bounded browser-local source heuristics, NOT a DOM parser, WCAG audit or
 * browser behavior / security guarantee. No project code executes here.
 */
export const DEVELOPER_HTML_QUALITY_KINDS = Object.freeze([
  "html-links-resolve",
  "html-images-have-alt",
  "html-unique-ids",
  "html-buttons-named",
  "html-label-targets",
  "html-no-inline-handlers",
]);
export const DEVELOPER_CSS_QUALITY_KINDS = Object.freeze(["css-selector-exists"]);

const safeCssSelector = /^[.#a-zA-Z][a-zA-Z0-9_.#:\[\]="'\s()>+~-]{0,79}$/;

export function isSafeDeveloperCssSelector(value) {
  return typeof value === "string" && value.length > 0 && safeCssSelector.test(value) &&
    !/[{};\\]/.test(value);
}
function lineno(text, offset) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}
function passed(reason, line=1) { return { ok:true, reason, line }; }
function failed(reason, line=0) { return { ok:false, reason, line }; }
function collectIds(text) {
  return Array.from(text.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi), match =>
    ({ name: match[2], line: lineno(text, match.index) }));
}
function quotedAttribute(tag, name) {
  const result = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*([\"'])(.*?)\\1", "i").exec(tag);
  return result ? result[2] : null;
}

export function checkDeveloperHtmlQuality(source, kind) {
  if (typeof source !== "string" || !DEVELOPER_HTML_QUALITY_KINDS.includes(kind)) {
    throw new Error("Unsupported static HTML quality assertion.");
  }
  const ids = collectIds(source);
  const set = new Set(ids.map(item=>item.name));
  if (kind === "html-unique-ids") {
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id.name)) return failed("duplicate-html-id", id.line);
      seen.add(id.name);
    }
    return passed("unique-html-ids");
  }
  if (kind === "html-links-resolve") {
    for (const match of source.matchAll(/<a\b[^>]*>/gi)) {
      const target = quotedAttribute(match[0], "href");
      if (target && target.startsWith("#") && !set.has(target.slice(1))) {
        return failed("unresolved-local-anchor", lineno(source,match.index));
      }
    }
    return passed("local-anchors-resolved");
  }
  if (kind === "html-images-have-alt") {
    for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
      if (quotedAttribute(match[0], "alt") === null) {
        return failed("image-missing-alt", lineno(source,match.index));
      }
    }
    return passed("images-have-alt-attributes");
  }
  if (kind === "html-buttons-named") {
    for (const match of source.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button\s*>/gi)) {
      const opening = match[0].slice(0,match[0].indexOf(">")+1);
      const name = quotedAttribute(opening, "aria-label");
      const text = match[1].replace(/<[^>]*>/g,"").trim();
      if (!text && !(name && name.trim())) {
        return failed("button-missing-text-or-aria-label", lineno(source,match.index));
      }
    }
    return passed("buttons-have-simple-names");
  }
  if (kind === "html-label-targets") {
    for (const match of source.matchAll(/<label\b[^>]*>/gi)) {
      const target = quotedAttribute(match[0], "for");
      if (target !== null && !set.has(target)) {
        return failed("label-target-missing", lineno(source,match.index));
      }
    }
    return passed("explicit-label-targets-found");
  }
  if (kind === "html-no-inline-handlers") {
    for(const match of source.matchAll(/<\w+\b[^>]*>/gi)) {
      if (/\s+on[a-z]+\s*=/i.test(match[0])) {
        return failed("inline-handler-detected", lineno(source,match.index));
      }
    }
    return passed("no-inline-event-handlers-detected");
  }
  throw new Error("Unrecognized HTML quality check.");
}

export function checkDeveloperCssSelector(source, expected) {
  if (typeof source !== "string" || !isSafeDeveloperCssSelector(expected)) {
    throw new Error("CSS selector assertion requires a simple literal selector.");
  }
  const blocks = /(?:^|})\s*([^{}]+)\s*\{/g;
  for (const match of source.matchAll(blocks)) {
    const group = match[1].replace(/\/\*[\s\S]*?\*\//g,"").trim();
    if (group.split(",").some(selector=>selector.trim()===expected)) {
      return passed("css-selector-found", lineno(source, match.index));
    }
  }
  return failed("css-selector-not-found");
}

export function recommendedDeveloperQualityTests(project, existing=[]) {
  if(!project || !Array.isArray(project.files) ||
      !project.files.some(file=>file.name.toLowerCase()==="index.html")) return [];
  const signatures = new Set(existing.map(item=>[item.kind,item.file.toLowerCase(),item.expected,item.path].join("|")));
  const suggested=[];
  for(const kind of DEVELOPER_HTML_QUALITY_KINDS){
    const result={id:"quality-"+kind,kind,file:"index.html",expected:"",path:""};
    const signature=[result.kind,result.file,result.expected,result.path].join("|");
    if(!signatures.has(signature)){ suggested.push(result); signatures.add(signature); }
  }
  return suggested;
}
