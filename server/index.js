import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, TOOLS } from './prompt.js';

const PORT = process.env.PORT || 8787;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: !!process.env.ANTHROPIC_API_KEY });
});

// Streams the assistant's explanation text and the proposed edit tool-calls to
// the client over SSE. The client (not the server) validates and stages the
// edits, so each tool_use is acknowledged with a synthetic "staged" result and
// the loop continues until the model produces its final summary.
app.post('/api/chat', async (req, res) => {
  const { messages = [], song } = req.body ?? {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    send({ type: 'error', message: 'Server is missing ANTHROPIC_API_KEY.' });
    return res.end();
  }

  const system = buildSystemPrompt(song);
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  try {
    for (let turn = 0; turn < 4; turn++) {
      const stream = client.messages.stream({
        model: MODEL,
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

      if (final.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      // Acknowledge each edit as staged so the model can chain or wrap up.
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
  res.end();
});

app.listen(PORT, () => {
  console.log(`strudel-ai proxy on http://localhost:${PORT} (model ${MODEL})`);
});
