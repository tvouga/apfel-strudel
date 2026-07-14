// System prompt + tool schemas that ground Claude in Strudel and constrain it
// to structured, part-level edits (never freeform buffer rewrites).
//
// NOTE: server/prompt.js and web/functions/_lib/prompt.js are kept as exact
// copies — edit both together.

export const STRUDEL_REFERENCE = `
You are the music co-producer inside a Strudel live-coding app. Strudel is a
JavaScript port of the TidalCycles pattern language that runs in the browser.
The song is a set of named PARTS. Each part is one Strudel pattern (one \`$:\` line).

You edit the song ONLY by calling the provided tools. Never reply with raw code
in prose. Keep edits small and musical. One cycle = one bar (4 beats).

If you are about to write or change chords, basslines, melodies, or scales and
you are not completely sure of the correct syntax or the right harmonic choice,
call the lookup_theory tool FIRST (you can call it several times; it is fast
and invisible to the user). Wrong chord symbols fail silently or sound bad.

## Mini-notation (inside double quotes)
- Sequence: "bd sd bd sd"  (4 events across the bar)
- Rest: ~            e.g. "bd ~ sd ~"
- Subdivide: [a b]   plays a then b in one slot:  "bd [sd sd]"
- Repeat: *          "hh*4" = four hats per slot;  "bd*2"
- Replicate: !       "bd!3 sd" = bd bd bd sd (separate events)
- Slow: /            "bd/2" = every 2 cycles
- Alternate: <a b>   one per cycle:  "<c e g>";  "<Am7 F^7>" one chord per bar
- Parallel: ,        "[bd, hh*4]" layers them
- Elongate: @        "a@3 b" makes a 3x longer
- Euclid: (3,8)      "bd(3,8)"
- Random drop: ?     "hh*8?" randomly skips events (also .degradeBy(0.3))

## Harmony: chords & voicings — SYNTAX IS STRICT
A chord is a root (letter + optional # or b) followed by a symbol from the
voicing dictionary. The full list of valid symbols:
  major:    ^  ^7  ^9  ^13  ^7#11  ^9#11  ^7#5  6  69  add9  2  5
  minor:    -  -7  -9  -11  -6  -69  -^7  -^9  -7b5  -b6  -#5  -add9
  dominant: 7  9  11  13  7b9  7#9  7#11  7b5  7#5  9#11  9b5  9#5  7b13  7alt
            13#11  13b9  13#9  7#9#5  7#9b5  7#9#11  7b9#11  7b9b5  7b9#5
            7b9#9  7b9b13
  sus:      sus  7sus  9sus  13sus  7b9sus  7susadd3  7b13sus
  dim/half-dim:  o  o7  h  h7  h9
  augmented:     aug  (or +)
Synonyms: "-" = "m" (C-7 = Cm7), "^" = "M" (C^7 = CM7 = major seventh).
NEVER write: Cmaj7, CMAJ7, Cmin7, Cdim, Cdim7, C7sus4, CmM7 with wrong case.
Correct examples: C^7  Am7  A-7  G7  Bb^7  F#m7b5  F#h7  Do7  Ebm9  A7b13  Dsus  C69

Voicing patterns (preferred way to play chords):
- chord("<Am7 F^7 C^7 G7>").voicing()               one chord per bar
- chord("<Am7 F^7>*2").voicing()                    two chords per bar
- .anchor("c5")  keeps top note near c5;  .mode("below") stacks under it
- rhythmic comping: chord("<Am7 F^7>").struct("[~ x]*2").voicing()
- arpeggio from the voicing: n("0 1 2 3").chord("<Am7 F^7>").voicing()
- Keep chords in the mid register (anchor around c5) and give them
  .gain(0.4–0.6) so they sit behind drums and bass.

## Melody & scales
- n("0 2 4 7").scale("C:minor")   scale degrees (0-indexed) — melodies stay in key
- scale names: major, minor, dorian, phrygian, lydian, mixolydian, locrian,
  harmonic minor, melodic minor, major pentatonic, minor pentatonic, blues
- note("c3 eb3 g3")  absolute notes when you need exact pitches
- Put chord tones on strong beats; move mostly stepwise; repeat a short motif
  with small variations (<> alternation, .sometimes) instead of wandering.

## Bass
- Follow the chord ROOTS in octave 1–2: with chords <Am7 F^7 C^7 G7> use
  note("<a1 f1 c2 g2>") (or scale degrees in octave 1–2).
- House/techno offbeat bass: note("[~ a1]*4").s("sawtooth").lpf(700)
- Root–fifth–octave figures and a chromatic/scalar approach note into the next
  chord's root make basslines musical.

## Common sources & functions
- s("bd sd hh cp")  drum samples (bd kick, sd snare, hh hat, cp clap, oh open hat, rim, lt/mt/ht toms)
- .bank("RolandTR909")  drum machine bank (also TR808, TR707, LinnDrum, ...)
- note("c3 e3 g3")  pitched notes;  n("0 2 4").scale(...)  scale degrees
- .s("sawtooth"|"square"|"triangle"|"sine")   synth waveform for note()/n()
- .gain(0.8)  .pan(0.5)  .speed(1)  .velocity(.8)
- .lpf(800).lpq(6)  low-pass (cutoff, resonance);  .hpf(...)  high-pass
- .room(0.4).roomsize(3)  reverb;  .delay(0.5).delaytime(0.125).delayfeedback(0.4)
- .attack(.01).decay(.1).sustain(.5).release(.2)  envelope
- .crush(4)  bitcrush;  .coarse(2);  .vowel("a")
- .every(4, x=>x.fast(2))  .sometimes(x=>x.crush(4))  .rarely(...)  .often(...)
- .swingBy(1/3, 4)  swing;  .fast(2)  .slow(2)  .rev()  .palindrome()
- .euclid(3,8);  .struct("x ~ x x")  rhythm mask
- .jux(rev)  stereo split;  stack(a, b)  layer patterns

## Style guidance
- Build grooves from layered parts: drums, bass, chords, lead, fx.
- Prefer editing an existing part over adding many tiny parts.
- Pick ONE key per song and stay diatonic unless asked; make bass, chords and
  melody agree on that key. State the key in your summary when you set it.
- Mind the frequency spectrum: kick+bass low, chords mid, hats/lead high; cut
  bass lows out of chords (e.g. .hpf(200) on pads) to avoid mud.
- A part's code is the FULL expression for that line, without the leading "$:".
  Example part code: \`s("bd*2 [~ sd] hh*4").bank("RolandTR909")\`
- When the user selects part of the song, focus your edit there.
`;

// ---------------------------------------------------------------------------
// Built-in theory reference, served to the model via the lookup_theory tool.
// ---------------------------------------------------------------------------

const THEORY_TOPICS = {
  chord_symbols: `CHORD SYMBOL DICTIONARY (what voicing() accepts)
A chord = root note (A–G, optional # or b) + one symbol below. Anything else
(maj7, min7, dim, sus4...) is INVALID and will not voice correctly.

major:     ^ (triad, or empty: "C"), ^7, ^9, ^13, ^7#11, ^9#11, ^7#5, 6, 69, add9, 2, 5
minor:     - or m (triad), -7/m7, -9/m9, -11/m11, -6/m6, -69/m69, -^7/m^7 (minor-major7),
           -^9/m^9, -7b5/m7b5, -b6/mb6, -#5/m#5, -add9/madd9
dominant:  7, 9, 11, 13, 7b9, 7#9, 7#11, 7b5, 7#5, 9#11, 9b5, 9#5, 7b13, 7alt,
           13#11, 13b9, 13#9, 7#9#5, 7#9b5, 7#9#11, 7b9#11, 7b9b5, 7b9#5, 7b9#9, 7b9b13
sus:       sus, 7sus, 9sus, 13sus, 7b9sus, 7susadd3, 7b13sus
dim:       o (dim triad), o7 (dim7)
half-dim:  h (triad), h7 (= m7b5), h9
augmented: aug or +

Translations from common names:
  Cmaj7 → C^7      Cmin7 → Cm7      Cdim → Co       Cdim7 → Co7
  Cm7b5/Cø → Ch7   C7sus4 → C7sus   Caug → C+       CminMaj7 → Cm^7
  C6/9 → C69       Cadd9 → Cadd9    C半dim → Ch7

Usage: chord("<C^7 A7 Dm7 G7>").voicing() — angle brackets = one chord per
cycle; append *2 for two per cycle. Slash chords (C/E) are NOT supported —
put the bass note in the bass part instead.`,

  progressions: `COMMON PROGRESSIONS (all in valid Strudel symbols)
Write them as: chord("<...>").voicing()  — one chord per bar by default.

Pop / EDM (major):
  I–V–vi–IV      "<C G Am F>"          (bright, anthemic)
  vi–IV–I–V      "<Am F C G>"          (wistful pop)
  I–IV           "<C F>"               (simple, gospel-ish with ^7/9: "<C^9 F^9>")
Minor EDM / techno / house:
  i–VI–III–VII   "<Am F C G>" in A minor (epic minor)
  i–VII–VI–VII   "<Am G F G>"           (driving)
  i–iv           "<Am7 Dm7>" or richer "<Am9 Dm9>" (deep house vamp)
  static vamp    "<Am7>" or "<Am9 Am11>" — house often sits on ONE minor 9/11 chord
Jazz:
  major ii–V–I   "<Dm7 G7 C^7>"
  minor ii–V–i   "<Dh7 G7b9 Cm6>" (or Cm^7 for a darker tonic)
  turnaround     "<C^7 A7 Dm7 G7>"
  modal (dorian) "<Dm7 Em7>" over D dorian
Lo-fi / neo-soul:
  "<Dm9 G13 C^9 A7b13>"   (ii–V–I with color, then V/ii)
  "<Fm9 Bb13 Eb^9 C7#9>"  (transposed, spicier)
Blues (12-bar, one chord per bar):
  "<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>"
Roman-numeral cheat (major key C): I=C, ii=Dm, iii=Em, IV=F, V=G, vi=Am, vii°=Bo.
Natural minor key A: i=Am, ii°=Bo, III=C, iv=Dm, v=Em (V=E7 borrowed), VI=F, VII=G.`,

  scales_and_keys: `SCALES & KEYS
n("0 2 4 7").scale("C:minor") — n() indexes scale degrees, 0-based; numbers
past the scale length wrap into the next octave (7 = root an octave up in a
7-note scale). Set register with octave on the root: scale("C2:minor").

Useful scale names: major, minor, dorian, phrygian, lydian, mixolydian,
locrian, harmonic minor, melodic minor, major pentatonic, minor pentatonic,
blues, whole tone.

Character: dorian = minor with a hopeful lift (house/funk staple);
phrygian = dark, Spanish/techno; lydian = dreamy, floating; mixolydian =
bluesy major; harmonic minor = dramatic, works over V7b9 in minor;
pentatonics/blues = safest for improvised-sounding leads.

Matching scale to chords (play THIS scale over THOSE chords):
  <C G Am F>            → C major
  <Am F C G>            → A minor (aeolian)
  <Am7 Dm7> vamp        → A dorian (the b7+nat6 colors it) or A minor
  <Dm7 G7 C^7>          → C major throughout, or D dorian / G mixolydian per chord
  <Cm7 Fm7>             → C dorian or C minor pentatonic
  blues in C            → C blues scale over everything
Rule of thumb: pick the key first, choose chords from it (see progressions),
then melodies/bass use the same scale — instant coherence.`,

  basslines: `BASSLINES
The bass states the ROOT of the current chord, in octave 1–2. With chords
"<Am7 F^7 C^7 G7>" the safest bass is note("<a1 f1 c2 g2>").

Patterns (swap roots to match your progression):
  sustained roots   note("<a1 f1 c2 g2>").s("sawtooth").lpf(500)
  offbeat house     note("[~ a1]*4").s("sawtooth").lpf(700).release(.1)
  octave pump       note("[a1 a2]*4").s("square").lpf(600)   (electro/synthwave)
  root–fifth        note("<[a1 e2] [f1 c2] [c2 g2] [g1 d2]>")
  walking (jazzy)   note("<[a1 c2 e2 g1] [f1 a1 c2 e1]>")  — chord tones + approach
  acid 16ths        note("a1*16").struct("x ~ x x ~ x x ~ x x ~ x x ~ x x")
                    .s("sawtooth").lpf(sine.range(300,2000).slow(4)).lpq(8)
Technique:
- Approach notes: land on the next chord's root via a step above/below on beat 4.
- Keep it MONO and short (.release(.05–.2)); long low notes blur the groove.
- One bass part only; .lpf(400–800) tames sawtooth harshness.
- Sidechain feel: put a rest or low gain on beat 1 hits when the kick hits.`,

  melody_and_leads: `MELODY & LEAD WRITING
1. Use the song's scale: n("...").scale("<key>:<scale>") — see scales_and_keys.
2. Chord tones (degrees 0, 2, 4 of the current chord) on strong beats
   (1 and 3); steps and neighbours in between.
3. Motif first: write a SHORT figure (2–4 notes), repeat it, vary it:
     n("0 2 4 2").scale("A2:minor")            plain motif
     n("<0 0 3 2> 2 4 [2 ~]").scale(...)       varied per cycle with <>
     .sometimes(x=>x.rev())  .every(4, x=>x.fast(2))   controlled variation
4. Call and response: melody in bars 1–2, space (rests) in bars 3–4.
5. Register: leads live around octave 3–4 (n with scale("A3:...")), above
   chords, below hats' brightness. Add .delay(.3).delaytime(.375) for width.
6. Rests are music: "0 ~ 2 ~" breathes; a melody with no rests fatigues.
7. Tension: end phrases on scale degree index 1 or 6 (the 2nd or 7th) to pull
   forward; resolve to 0 (root) or 4 (the fifth) to come to rest.`,

  rhythm_and_grooves: `DRUM GROOVES (mini-notation, .bank() for flavor)
four-on-floor    s("bd*4, [~ hh]*4, ~ cp ~ cp").bank("RolandTR909")
house w/ open hat s("bd*4, [~ hh]*4, [~ oh]*2, ~ cp ~ cp")
techno           s("bd*4, hh*8, ~ cp ~ ~").sometimes(x=>x.speed(1.02))
breakbeat        s("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")
hip-hop / lofi   s("bd ~ ~ bd, ~ ~ sd ~, hh*4").swingBy(1/3, 4).slow(1)  at 80–95 bpm
trap             s("bd ~ ~ [~ bd], ~ ~ sd ~, hh*8 [hh*16]!3")
dnb (fast bpm)   s("bd ~ ~ bd ~ ~ bd ~, ~ ~ sd ~ ~ sd ~ ~, hh*8") at 170 bpm
Techniques:
- Layer with commas inside one part: "[bd*4, hh*8, ~ cp ~ cp]".
- Humanize: .swingBy(1/3, 4) (triplet swing on hats), hh*8? or
  .degradeBy(.2) to thin hats, .velocity("[1 .6]*4") for accent patterns.
- Ghost notes: quiet snares on offbeats — ", [~ sd]?".gain-ed low.
- Fills: .every(4, x=>x.fast(2)) on the last bar, or a dedicated fill part.
- Banks: RolandTR909 (house/techno), RolandTR808 (hip-hop/trap),
  LinnDrum (80s), RolandTR707 (pop).`,

  voicing_and_arranging: `VOICING & MIX-MINDED ARRANGING
Voicing:
- chord("...").voicing() already voice-leads smoothly; steer register with
  .anchor("c5") (top note gravitates there) and .mode("below").
- Comping rhythm: .struct("[~ x]*2") = offbeat stabs (house); "x ~ [~ x] ~"
  = pushed. Long pads: plain .voicing().attack(.3).release(.5).
- Don't double the bass root inside chords — keep chords above c3, or
  .hpf(200) the chord part.
Spectrum & gain staging (parts should ADD UP, not fight):
- kick + bass own 20–200 Hz; chords/keys 200 Hz–2 kHz; hats/lead sparkle above.
- Typical gains: drums .9–1, bass .7–.9, chords .4–.6, lead .5–.7, fx .3–.5.
- Reverb on pads/leads (.room), NOT on kick/bass (mud).
Energy over time:
- .every(8, x=>x.hpf(1200)) or a filter sweep = cheap transition.
- Vary one thing per 4/8 bars: drop a part, open a filter, add a hat layer.
- Fewer, better parts: 3–5 parts that groove beat 8 that clutter.`,

  song_form: `SONG FORM & SECTIONS
Typical electronic arrangement (each block 8–16 bars):
  intro    drums-lite + one harmonic element (pad or bass)
  build    add bass, close hats, rising tension (filter opening, snare rolls)
  drop     everything in; the hook (lead/chords) carries
  break    remove kick + bass, keep pads/melody; space and reverb
  drop 2   like drop 1 with one new twist (extra layer, varied melody)
  outro    peel layers off in reverse
Song-app tips:
- This app has SECTIONS: parts can be tagged to sections (intro/verse/drop...)
  and the user can switch which section plays. When asked to "make an intro",
  prefer thinner textures of EXISTING material over brand-new ideas.
- Contrast is the tool: if the drop is busy, the intro must be sparse.
- Keep the same key and tempo across sections; change density and register.
- Hooks repeat: the listener needs to hear the main idea at least 3 times.`,
};

export function lookupTheory(input) {
  const topic = String(input?.topic ?? '');
  const entry = THEORY_TOPICS[topic];
  if (entry) return entry;
  return `Unknown topic "${topic}". Valid topics: ${Object.keys(THEORY_TOPICS).join(', ')}`;
}

export function buildSystemPrompt(song) {
  const parts = (song?.parts ?? [])
    .map((p) => `- ${p.name}${p.muted ? ' (muted)' : ''}: ${p.code}`)
    .join('\n') || '  (empty song)';
  const sections = (song?.sections ?? [])
    .map((s) => `${s.name}${s.active ? ' (active)' : ''}`)
    .join(', ');
  return `${STRUDEL_REFERENCE}

## Current song
tempo: ${song?.tempo ?? 120} bpm
parts:
${parts}
${sections ? `sections: ${sections}\n` : ''}
Make the change the user asks for by calling tools. Consult lookup_theory
before writing harmonic material you are not sure about. After your tool
calls, give a one-sentence summary of what you changed (mention the key if
you chose one). Do not include code in the summary.`;
}

export const TOOLS = [
  {
    name: 'lookup_theory',
    description:
      'Look up the built-in Strudel + music-theory reference. Call this BEFORE writing chords, progressions, basslines, melodies, scales, grooves, or arrangements whenever you are not completely certain of the correct Strudel syntax or the right musical choice. The result is only visible to you, not the user. You may call it multiple times.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: [
            'chord_symbols',
            'progressions',
            'scales_and_keys',
            'basslines',
            'melody_and_leads',
            'rhythm_and_grooves',
            'voicing_and_arranging',
            'song_form',
          ],
          description:
            'chord_symbols: valid chord notation for voicing(); progressions: genre progressions with correct symbols; scales_and_keys: scale() names, matching scales to chords; basslines: patterns + technique; melody_and_leads: writing melodies; rhythm_and_grooves: drum patterns per genre; voicing_and_arranging: registers, gain staging, comping; song_form: sections and arrangement over time.',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'update_part',
    description:
      "Replace the Strudel code of an existing part. Provide the full pattern expression (without the leading '$:').",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the part to update.' },
        code: { type: 'string', description: 'Full Strudel pattern code for this part.' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'add_part',
    description: 'Add a new named part (a new layer/track) to the song.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short unique part name, e.g. "lead".' },
        code: { type: 'string', description: 'Full Strudel pattern code for this part.' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'remove_part',
    description: 'Remove a part from the song.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'mute_part',
    description: 'Mute or unmute a part without deleting it.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        muted: { type: 'boolean' },
      },
      required: ['name', 'muted'],
    },
  },
  {
    name: 'set_tempo',
    description: 'Set the song tempo in BPM.',
    input_schema: {
      type: 'object',
      properties: { bpm: { type: 'number' } },
      required: ['bpm'],
    },
  },
];
