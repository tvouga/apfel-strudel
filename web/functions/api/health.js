// Cloudflare Pages Function: GET /api/health
export function onRequestGet(context) {
  const { env } = context;
  return new Response(
    JSON.stringify({
      ok: true,
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      hasKey: !!env.ANTHROPIC_API_KEY,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
