# apfel·strudel — AI music studio

Make music by chatting with Claude. The sound engine is
[Strudel](https://strudel.cc) (a browser-based live-coding language); Claude edits
the song *part by part* while it plays, and every edit is validated and staged
before it can go live.

Milestone 1 (this build): a working single-player core.

## Architecture

The linchpin is the **parts layer**: the song is a structured document
(`Song = { tempo, parts[], sections[] }`), and the CodeMirror buffer is a
projection of it. Each part maps to one Strudel labeled pattern (`name: pattern`).
This one abstraction powers mute/solo, selection-context, AI edits, and the
"later" features (collab, snippets, karaoke) without special-casing.

```
web/                      Vite + React app
  src/song/model.ts       Song/Part/Section types
  src/song/parse.ts       buffer <-> parts, selection -> part resolver
  src/strudel/engine.ts   @strudel/web wrapper: transport, cycle clock, next-bar apply
  src/ai/client.ts        SSE stream from the proxy
  src/ai/tools.ts         tool calls -> candidate Song (pure)
  src/ai/validate.ts      Layer 1 compile gate + Layer 2 silence check
  src/components/         Editor, PartsRail, TransportBar, ChatPanel, StagingPanel
server/                   thin Anthropic proxy (holds the API key)
  index.js                /api/chat streams Claude tool-use over SSE
  prompt.js               Strudel grounding + tool schemas
```

### How an AI edit flows
1. You type a prompt (optionally with a selection chip for context).
2. The proxy streams Claude's explanation + structured tool calls
   (`update_part`, `add_part`, `mute_part`, `set_tempo`, …).
3. Tool calls build a **candidate** Song — the live song is untouched.
4. Validation runs: **Layer 1** transpiles/evaluates each part offline (catches
   hallucinated functions; the live song is never broken), **Layer 2** checks via
   a pure `queryArc` that the pattern actually produces audible events.
5. The candidate lands in the **staging panel**: see the diff, audition it
   (A/B against live), then Accept (applies on the next bar) or Discard.

## Running it

Two processes. You need an Anthropic API key for the chat (audio + editor work
without one).

```bash
# 1. backend proxy
cd server
cp .env.example .env        # put your ANTHROPIC_API_KEY in .env
npm install
npm run dev                 # http://localhost:8787

# 2. web app
cd web
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173, press ▶ (a real click is required to start audio),
and ask the chat for a change.

## On the radar (not built yet, but the model is ready for them)
- Live collaborative jam: `Song` is plain data → Yjs CRDT + a host-broadcast
  transport; audio renders locally per client (no streaming). Works on mobile.
- Snippet library + section progression (sections already in the model).
- Karaoke / song-structure timeline (cycle-aligned track + Strudel highlighting).
- Validation Layer 3: true audio RMS via an OfflineAudioContext.
