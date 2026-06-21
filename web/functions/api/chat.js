// Cloudflare Pages Function: POST /api/chat
// Same behaviour as server/index.js, on the Workers runtime. Streams the
// assistant's text and proposed edit tool-calls over SSE; the client validates
// and stages the edits, so each tool_use is acknowledged as "staged".

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, TOOLS } from '../_lib/prompt.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { messages = [], song } = await request.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const model = env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  const body = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      if (!env.ANTHROPIC_API_KEY) {
        send({ type: 'error', message: 'Server is missing ANTHROPIC_API_KEY.' });
        return controller.close();
      }

      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const system = buildSystemPrompt(song);
      const convo = messages.map((m) => ({ role: m.role, content: m.content }));

      try {
        for (let turn = 0; turn < 4; turn++) {
          const stream = client.messages.stream({
            model,
            max_tokens: 1500,
            system,
            tools: TOOLS,
            messages: convo,
          });
          stream.on('text', (delta) => send({ type: 'text', delta }));

          const final = await stream.finalMessage();
          const toolUses = final.content.filter((b) => b.type === 'tool_use');
          for (const tu of toolUses) {
            send({ type: 'tool', id: tu.id, name: tu.name, input: tu.input });
          }
          if (final.stop_reason !== 'tool_use' || toolUses.length === 0) break;

          convo.push({ role: 'assistant', content: final.content });
          convo.push({
            role: 'user',
            content: toolUses.map((tu) => ({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: 'Staged for the user to review and audition.',
            })),
          });
        }
        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: err?.message ?? 'Unknown error' });
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
