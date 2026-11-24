// Staging-only deployment entrypoint until Wave 23 controls pass acceptance.
// Does not read service credentials, cannot access evidence regardless of secrets.
Deno.serve((_req: Request) => new Response(JSON.stringify({ code: "gateway-disabled" }), {
  status: 503,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
