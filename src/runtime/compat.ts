/**
 * Orium - Runtime Compatibility Layer
 * Detects environment and loads appropriate runtime.
 */

export type Runtime = 'node' | 'bun' | 'deno' | 'browser' | 'worker' | 'edge';

export interface PlatformInfo {
  runtime: Runtime;
  version: string;
  os: string;
  arch: string;
  supports: {
    fs: boolean;
    net: boolean;
    childProcess: boolean;
    wasm: boolean;
    threads: boolean;
  };
}

function detectRuntime(): Runtime {
  // @ts-ignore
  if (typeof Bun !== 'undefined') return 'bun';
  // @ts-ignore
  if (typeof Deno !== 'undefined') return 'deno';
  // @ts-ignore
  if (typeof window !== 'undefined') return 'browser';
  // @ts-ignore
  if (typeof self !== 'undefined' && typeof importScripts === 'function') return 'worker';
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined') return 'edge';
  return 'node';
}

export function getPlatformInfo(): PlatformInfo {
  const runtime = detectRuntime();

  return {
    runtime,
    version: process?.version || 'unknown',
    os: process?.platform || 'unknown',
    arch: process?.arch || 'unknown',
    supports: {
      fs: runtime === 'node' || runtime === 'bun' || runtime === 'deno',
      net: runtime !== 'browser',
      childProcess: runtime === 'node' || runtime === 'bun',
      wasm: true,
      threads: runtime === 'node' || runtime === 'bun' || runtime === 'deno',
    },
  };
}

export function isNode(): boolean {
  return detectRuntime() === 'node';
}

export function isBrowser(): boolean {
  return detectRuntime() === 'browser';
}

export function isEdge(): boolean {
  return detectRuntime() === 'edge';
}
