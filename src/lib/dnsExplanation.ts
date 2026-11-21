// Only the navigation token enters browser history. The report lives in this tab's memory.
let pending: { token: string; owner: string; prompt: string } | undefined;

export function prepareDnsExplanation(owner: string, summary: string) {
  const token = crypto.randomUUID();
  pending = { token, owner, prompt: `Explain this DNS check in plain language. What do these counts tell me, and what would I need to check separately?\n\n${summary}` };
  return token;
}

export function readDnsExplanation(token: unknown, owner: string) {
  return pending && pending.token === token && pending.owner === owner ? pending.prompt : "";
}

export function clearDnsExplanation(token: unknown) {
  if (pending?.token === token) pending = undefined;
}
