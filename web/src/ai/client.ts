// Streams /api/chat (SSE) and surfaces assistant text + proposed tool calls.

import type { Song } from '../song/model';
import type { ToolCall } from './tools';

// Same-origin by default: Vite proxies /api to the Express server in dev, and
// Cloudflare Pages Functions serve /api in production. Override with VITE_API_URL.
const API = import.meta.env.VITE_API_URL ?? '';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamHandlers {
  onText?: (delta: string) => void;
  onTool?: (call: ToolCall) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function streamChat(
  messages: ChatMessage[],
  song: Song,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, song }),
    signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      switch (evt.type) {
        case 'text':
          handlers.onText?.(String(evt.delta ?? ''));
          break;
        case 'tool':
          handlers.onTool?.({
            id: String(evt.id),
            name: String(evt.name),
            input: (evt.input as Record<string, unknown>) ?? {},
          });
          break;
        case 'error':
          handlers.onError?.(String(evt.message ?? 'error'));
          break;
        case 'done':
          handlers.onDone?.();
          break;
      }
    }
  }
}

export async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/health`);
    const data = await res.json();
    return Boolean(data.hasKey);
  } catch {
    return false;
  }
}
