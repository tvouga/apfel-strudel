import type { Song } from './model';

export const seedSong: Song = {
  tempo: 124,
  parts: [
    { name: 'drums', code: 's("bd*2 [~ sd] hh*4").bank("RolandTR909")', muted: false },
    { name: 'bass', code: 'note("c2 [eb2 g2] c2 f2").s("sawtooth").lpf(800).lpq(6)', muted: false },
    { name: 'chords', code: 'n("0 2 4").chord("Cm7").voicing().s("triangle").gain(0.5).room(0.4)', muted: false },
  ],
  sections: [
    { name: 'intro', active: false },
    { name: 'verse', active: true },
    { name: 'drop', active: false },
  ],
};
