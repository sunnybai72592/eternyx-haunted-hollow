import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Braces, Clock3, Code2, FileCode2, FileDiff, FileSpreadsheet, Eye, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  convertTimestamp, createLineDiff, decodeHtmlEntities, encodeHtmlEntities,
  jsonArrayToCsv, renderMarkdownSafe,
} from "@/lib/developerStudioAdvancedUtils.mjs";

const sampleMarkdown = "# Welcome to ETERNYX\n\nWrite **Markdown** on the left and preview it safely on the right.\n\n- Fast local processing\n- No account required\n\n[Open ETERNYX](https://example.com)";
const sampleJson = '[{"name":"ETERNYX","status":"active"},{"name":"Developer Studio","status":"building"}]';

function ToolCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: React.ElementType; children: React.ReactNode }) {
  return <Card className="border-slate-800 bg-slate-900/70 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-300" />{title}</CardTitle><CardDescription className="text-slate-400">{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}

function Output({ value, label = "Output" }: { value: string; label?: string }) {
  return <div className="space-y-2"><div className="flex items-center justify-between"><Label>{label}</Label><Button type="button" size="sm" variant="outline" disabled={!value} onClick={() => void navigator.clipboard.writeText(value)}>Copy</Button></div><Textarea readOnly value={value} spellCheck={false} className="min-h-48 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /></div>;
}

export default function AdvancedDeveloperTools() {
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [json, setJson] = useState(sampleJson);
  const [csv, setCsv] = useState("");
  const [html, setHtml] = useState("<h1>ETERNYX & friends</h1>");
  const [htmlMode, setHtmlMode] = useState<"encode" | "decode">("encode");
  const [timestamp, setTimestamp] = useState("1794278400");
  const [timestampResult, setTimestampResult] = useState("");
  const [left, setLeft] = useState("Build the future\nOne ecosystem\nEndless possibilities");
  const [right, setRight] = useState("Build ETERNYX\nOne ecosystem\nEndless possibilities");
  const [diff, setDiff] = useState<{type:string;value:string}[]>([]);
  const [errors, setErrors] = useState<Record<string,string>>({});

  const preview = useMemo(() => renderMarkdownSafe(markdown), [markdown]);
  const fail = (key: string, error: unknown) => setErrors((old) => ({ ...old, [key]: error instanceof Error ? error.message : "Unable to process this input." }));
  const clear = (key: string) => setErrors((old) => ({ ...old, [key]: "" }));

  const runCsv = () => { try { setCsv(jsonArrayToCsv(json)); clear("csv"); } catch (error) { setCsv(""); fail("csv", error); } };
  const runHtml = () => { try { setHtml(htmlMode === "encode" ? encodeHtmlEntities(html) : decodeHtmlEntities(html)); clear("html"); } catch (error) { fail("html", error); } };
  const runTimestamp = () => { try { setTimestampResult(JSON.stringify(convertTimestamp(timestamp), null, 2)); clear("time"); } catch (error) { setTimestampResult(""); fail("time", error); } };
  const runDiff = () => { try { setDiff(createLineDiff(left, right)); clear("diff"); } catch (error) { setDiff([]); fail("diff", error); } };

  return <div className="min-h-screen bg-[#070b14] text-white"><div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
    <Link to="/developer-studio" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Core Developer Studio</Link>
    <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/70 via-slate-950 to-violet-950/60 p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">ETERNYX · Professional workbench</p><h1 className="mt-3 text-4xl font-bold">Advanced <span className="text-cyan-300">Developer Tools</span></h1><p className="mt-4 max-w-2xl leading-7 text-slate-300">A focused set of practical utilities for documentation, data conversion, markup, time, and code review. Processing happens locally in your browser.</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">{["Markdown preview","JSON → CSV","HTML entities","Timestamp","Text diff"].map(x=><span key={x} className="rounded-full border border-slate-700 px-3 py-1.5">{x}</span>)}</div></section>
    <Tabs defaultValue="markdown" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-900 p-1 sm:grid-cols-5">
        <TabsTrigger value="markdown"><Eye className="mr-2 h-4 w-4" />Markdown</TabsTrigger><TabsTrigger value="csv"><FileSpreadsheet className="mr-2 h-4 w-4" />JSON → CSV</TabsTrigger><TabsTrigger value="html"><Code2 className="mr-2 h-4 w-4" />HTML</TabsTrigger><TabsTrigger value="time"><Clock3 className="mr-2 h-4 w-4" />Timestamp</TabsTrigger><TabsTrigger value="diff"><FileDiff className="mr-2 h-4 w-4" />Diff</TabsTrigger>
      </TabsList>
      <TabsContent value="markdown"><ToolCard title="Live Markdown Previewer" description="Preview headings, lists, emphasis, inline code, and safe HTTP(S) links. Raw HTML is escaped. " icon={Eye}><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-2"><Label>Markdown input</Label><Textarea value={markdown} onChange={e=>setMarkdown(e.target.value)} spellCheck={false} className="min-h-80 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /></div><div className="min-h-80 rounded-md border border-slate-700 bg-slate-950 p-4"><Label>Rendered preview</Label><div className="prose prose-invert mt-4 max-w-none" dangerouslySetInnerHTML={{__html:preview}} /></div></div><p className="mt-3 text-xs text-slate-500">Supported Markdown is intentionally lightweight. Raw HTML is never executed.</p></ToolCard></TabsContent>
      <TabsContent value="csv"><ToolCard title="JSON to CSV Converter" description="Convert arrays of JSON objects into spreadsheet-friendly CSV with quoted cells and consistent headers." icon={FileSpreadsheet}><div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3"><Label>JSON array</Label><Textarea value={json} onChange={e=>setJson(e.target.value)} spellCheck={false} className="min-h-64 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /><Button onClick={runCsv} className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"><WandSparkles className="mr-2 h-4 w-4" />Convert to CSV</Button>{errors.csv&&<p role="alert" className="text-sm text-rose-300">{errors.csv}</p>}</div><Output value={csv} label="CSV output" /></div><p className="mt-3 text-xs text-slate-500">Nested objects and arrays are serialized as JSON inside their CSV cells. Missing values are blank.</p></ToolCard></TabsContent>
      <TabsContent value="html"><ToolCard title="HTML Entity Encoder & Decoder" description="Safely encode special characters or decode common named and numeric HTML entities." icon={Code2}><div className="space-y-3"><div className="flex flex-wrap gap-2"><Button variant={htmlMode==="encode"?"default":"outline"} onClick={()=>setHtmlMode("encode")}>Encode</Button><Button variant={htmlMode==="decode"?"default":"outline"} onClick={()=>setHtmlMode("decode")}>Decode</Button></div><Label>{htmlMode==="encode"?"Text to encode":"Entities to decode"}</Label><Textarea value={html} onChange={e=>setHtml(e.target.value)} className="min-h-40 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /><Button onClick={runHtml} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">{htmlMode==="encode"?"Encode entities":"Decode entities"}</Button>{errors.html&&<p role="alert" className="text-sm text-rose-300">{errors.html}</p>}</div></ToolCard></TabsContent>
      <TabsContent value="time"><ToolCard title="Unix Timestamp Converter" description="Convert Unix seconds, milliseconds, or date strings into UTC representations." icon={Clock3}><div className="max-w-2xl space-y-3"><Label>Timestamp or date</Label><Input value={timestamp} onChange={e=>setTimestamp(e.target.value)} placeholder="e.g. 1700000000 or 2025-01-01T12:00:00Z" className="border-slate-700 bg-slate-950 text-white" /><Button onClick={runTimestamp} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">Convert time</Button>{errors.time&&<p role="alert" className="text-sm text-rose-300">{errors.time}</p>}<Output value={timestampResult} label="UTC and Unix values" /></div><p className="mt-3 text-xs text-slate-500">Numeric values with magnitude below 100 billion are interpreted as seconds; larger values are milliseconds.</p></ToolCard></TabsContent>
      <TabsContent value="diff"><ToolCard title="Line-by-Line Diff Checker" description="Compare two text versions and inspect unchanged, added, and removed lines." icon={FileDiff}><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Original</Label><Textarea value={left} onChange={e=>setLeft(e.target.value)} spellCheck={false} className="min-h-56 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /></div><div className="space-y-2"><Label>Revised</Label><Textarea value={right} onChange={e=>setRight(e.target.value)} spellCheck={false} className="min-h-56 border-slate-700 bg-slate-950 font-mono text-sm text-slate-100" /></div></div><Button onClick={runDiff} className="mt-4 bg-cyan-400 text-slate-950 hover:bg-cyan-300">Compare text</Button>{errors.diff&&<p role="alert" className="mt-2 text-sm text-rose-300">{errors.diff}</p>}<div className="mt-4 space-y-1 rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-sm">{diff.map((line,index)=><div key={index} className={line.type==="added"?"bg-emerald-950/60 text-emerald-300":line.type==="removed"?"bg-rose-950/60 text-rose-300":"text-slate-400"}><span className="mr-3 inline-block w-4">{line.type==="added"?"+":line.type==="removed"?"−":" "}</span>{line.value || " "}</div>)}</div><p className="mt-2 text-xs text-slate-500">Comparison is line-based and limited to 300 lines per side.</p></ToolCard></TabsContent>
    </Tabs>
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400"><FileCode2 className="mr-2 inline h-4 w-4 text-cyan-300" />All five utilities run locally. Do not paste secrets or sensitive production data into shared or public devices.</div>
  </div></div>;
}
