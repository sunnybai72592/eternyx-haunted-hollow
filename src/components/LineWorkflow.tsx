import { useMemo, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { cleanLines } from "@/lib/cleanLines.mjs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function LineWorkflow() {
  const [source, setSource] = useState("");
  const [deduplicate, setDeduplicate] = useState(true);
  const [order, setOrder] = useState("input");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const resultField = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const { lines, blanks, duplicates, trimmed } = useMemo(
    () => cleanLines(source, { deduplicate, ignoreCase, order }),
    [source, deduplicate, ignoreCase, order]
  );
  const result = lines.join("\n");

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus("Copied.");
    } catch {
      resultField.current?.focus();
      resultField.current?.select();
      setCopyStatus("Result selected. Use your device’s Copy command.");
    }
  }

  function downloadResult(format: "txt" | "json") {
    const json = format === "json";
    const url = URL.createObjectURL(new Blob([json ? JSON.stringify(lines, null, 2) : result], {
      type: json ? "application/json" : "text/plain;charset=utf-8"
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eternyx-clean-list." + format;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-6" onChange={() => setCopyStatus("")}>
    <h2 className="flex items-center gap-2 text-xl font-semibold"><ListFilter aria-hidden="true" className="size-5 text-primary" />Clean a list</h2>
    <p className="text-sm text-muted-foreground">Paste one item per line. Blank lines and outer spaces are removed in your browser.</p>
    <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <legend className="sr-only">Cleanup options</legend>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={deduplicate} onChange={e => setDeduplicate(e.target.checked)} /> Remove duplicates</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!deduplicate} checked={deduplicate && ignoreCase} onChange={e => setIgnoreCase(e.target.checked)} /> Ignore case for duplicates</label>
      <div className="flex items-center gap-2"><label htmlFor="workflow-order">Order</label>
        <select id="workflow-order" className="min-h-11 rounded-md border bg-background px-2" value={order} onChange={e => setOrder(e.target.value)}>
          <option value="input">Original</option><option value="ascending">A to Z</option><option value="descending">Z to A</option>
        </select>
      </div>
    </fieldset>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor="workflow-input">Input lines</label>
        <Textarea id="workflow-input" rows={8} value={source} onChange={e => setSource(e.target.value)} />
      </div>
      <div className="min-w-0 space-y-2"><label htmlFor="workflow-output">Result ({lines.length} lines)</label>
        <Textarea id="workflow-output" rows={8} ref={resultField} readOnly value={result} />
      </div>
    </div>
    {source && <p className="text-sm text-muted-foreground">Blank lines removed: {blanks} · Duplicates removed: {duplicates} · Nonblank lines trimmed: {trimmed}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!result} onClick={copyResult}>Copy result</Button>
      <Button variant="outline" disabled={!result} onClick={() => downloadResult("txt")}>Download .txt</Button>
      <Button variant="outline" disabled={!result} onClick={() => downloadResult("json")}>Download .json</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{copyStatus}</p>
  </section>;
}
