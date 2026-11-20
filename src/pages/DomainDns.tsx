import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { prepareDnsExplanation } from "@/lib/dnsExplanation";

export default function DomainDns() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const [result, setResult] = useState("");
  const [domain, setDomain] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setResult("");
    setBusy(true);
    setMessage("Checking DNS…");
    try {
      const { data, error } = await supabase.functions.invoke("dns-analyzer", { body: { domain: domain.trim() } });
      if (error || data?.success !== true || !Number.isInteger(data.dns_records) || !Number.isInteger(data.nameservers)) throw new Error();
      setMessage("");
      setResult(`${data.domain} · ${data.dns_records} DNS records observed · ${data.nameservers} nameservers observed.`);
    } catch { setMessage("Couldn’t complete the DNS check. Check the domain and your connection, then try again."); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-cyan-300/20 bg-slate-950 p-6 text-white">
    <h1 className="text-3xl font-bold">Check a domain’s DNS</h1>
    <p className="text-slate-300">Review public DNS for a domain you manage. The result is saved to your account.</p>
    <form onSubmit={check} className="space-y-3">
      <label className="block">Domain name<input required maxLength={253} disabled={busy} value={domain} onChange={e => {setDomain(e.target.value); setMessage(""); setResult("");}} placeholder="example.com" className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-900 p-3" /></label>
      <button disabled={busy || !domain.trim()} className="rounded-lg bg-cyan-200 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">Check DNS</button>
    </form>
    <p role="status">{result || message}</p>
    {result && user && <button type="button" className="min-h-11 rounded-lg border border-cyan-200/40 px-4 text-cyan-200" onClick={() => {
      const dnsExplanation = prepareDnsExplanation(user.id, result);
      navigate("/eternyx-ai", { state: { dnsExplanation } });
    }}>Explain with Eternyx AI</button>}
  </section>;
}
