declare module '@strudel/web' {
  export function initStrudel(opts?: Record<string, unknown>): Promise<unknown>;
  export function samples(url: string): Promise<unknown>;
  export function evaluate(code: string): Promise<unknown>;
  export function hush(): void;
  export function getAudioContext(): AudioContext;
}

declare module '@strudel/transpiler' {
  export function evaluate(code: string): Promise<{ pattern: unknown; meta?: unknown }>;
  export function transpiler(input: string, options?: Record<string, unknown>): { output: string };
}
