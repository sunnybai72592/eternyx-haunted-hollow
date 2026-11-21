import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

type Clip = { source: string; url: string };
type Review = { question: string; clips: Clip[]; verdict: string };

export default function BlindVideoReview() {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<boolean[]>([false, false]);
  const clips = review?.clips;
  useEffect(() => () => clips?.forEach(clip => URL.revokeObjectURL(clip.url)), [clips]);

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const question = String(data.get("question") ?? "").trim();
    const baseline = data.get("baseline"), candidate = data.get("candidate");
    if (!question || !(baseline instanceof File) || !baseline.size || !(candidate instanceof File) || !candidate.size) {
      setError("Choose two clips and enter a quality question."); return;
    }
    const pair = [{ source: "Baseline", url: URL.createObjectURL(baseline) }, { source: "Candidate", url: URL.createObjectURL(candidate) }];
    if (crypto.getRandomValues(new Uint8Array(1))[0] % 2) pair.reverse();
    setError(""); setReady([false, false]); setReview({question, clips: pair, verdict: ""});
  }

  function download() {
    if (!review?.verdict) return;
    const report = {version: 1, question: review.question, sources: {A: review.clips[0].source, B: review.clips[1].source}, verdict: review.verdict};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = "eternyx-video-comparison.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-labelledby="blind-review" className="space-y-3 rounded-xl border border-violet-300/20 p-4">
    <h3 id="blind-review" className="text-lg font-semibold">Blind video comparison</h3>
    {!review ? <form onSubmit={start} className="space-y-3">
      <p className="text-sm text-slate-300">Choose two local renders of the same prompt. Hand the screen to a reviewer after the clips are shuffled.</p>
      {["Baseline", "Candidate"].map(name => <label key={name} className="block">{name} clip
        <input name={name.toLowerCase()} type="file" accept="video/*" required className="mt-1 block w-full text-sm" /></label>)}
      <label className="block">Quality question<input required maxLength={300} name="question" placeholder="Which clip keeps the jacket consistent across shots?" className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" /></label>
      <Button type="submit" variant="outline">Start blind review</Button>
    </form> : <>
      <p className="break-words text-violet-200">{review.question}</p>
      <div className="grid gap-3 sm:grid-cols-2">{review.clips.map((clip, index) => <div key={clip.url}>
        <p>Clip {index ? "B" : "A"}{review.verdict && " · " + clip.source}</p>
        <video controls playsInline preload="auto" aria-label={"Clip " + (index ? "B" : "A")} src={clip.url}
          onLoadedData={() => setReady(previous => previous.map((value, i) => i === index || value))}
          onError={() => setError("A clip could not be played. Start a new comparison with a supported video.")}
          className="mt-1 max-h-64 w-full rounded bg-black" />
      </div>)}</div>
      {review.verdict ? <div role="status" className="space-y-2"><p>Recorded choice · {review.verdict}</p><Button onClick={download}>Download review</Button></div> :
        <div className="flex flex-wrap gap-2">{["Clip A", "Clip B", "Tie"].map(choice => <Button key={choice} disabled={Boolean(error) || !ready.every(Boolean)} onClick={() => setReview({...review, verdict: choice})}>{choice}</Button>)}</div>}
      <Button variant="outline" onClick={() => {setReview(null); setError("");}}>New comparison</Button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
