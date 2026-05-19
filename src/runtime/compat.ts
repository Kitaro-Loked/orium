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

/** Get the global object safely across all runtimes */
function getGlobalObject(): typeof globalThis {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof global !== 'undefined') return global as typeof globalThis;
  if (typeof self !== 'undefined') return self as typeof globalThis;
  if (typeof window !== 'undefined') return window as typeof globalThis;
  return {} as typeof globalThis;
}

function detectRuntime(): Runtime {
  const g = getGlobalObject();

  // Check Bun
  if ('Bun' in g && (g as Record<string, unknown>).Bun !== undefined) {
    return 'bun';
  }

  // Check Deno
  if ('Deno' in g && (g as Record<string, unknown>).Deno !== undefined) {
    return 'deno';
  }

  // Check Edge Runtime (Vercel, etc.)
  if ('EdgeRuntime' in g) {
    return 'edge';
  }

  // Check Node.js
  const proc = (g as Record<string, unknown>).process;
  if (proc && typeof proc === 'object' && 'versions' in proc && ((proc as Record<string, unknown>).versions as Record<string, unknown>)?.node) {
    return 'node';
  }

  // Check Web Worker
  if ('importScripts' in g && typeof (g as Record<string, unknown>).importScripts === 'function') {
    return 'worker';
  }

  // Check Browser (must be after worker/edge checks)
  if ('window' in g && 'document' in g) {
    return 'browser';
  }

  // Default to node for safety
  return 'node';
}

export function getPlatformInfo(): PlatformInfo {
  const runtime = detectRuntime();
  const g = getGlobalObject();
  const proc = (g as Record<string, unknown>).process;

  let version = 'unknown';
  let os = 'unknown';
  let arch = 'unknown';

  if (proc && typeof proc === 'object') {
    version = String((proc as Record<string, unknown>).version || 'unknown');
    os = String((proc as Record<string, unknown>).platform || 'unknown');
    arch = String((proc as Record<string, unknown>).arch || 'unknown');
  }

  return {
    runtime,
    version,
    os,
    arch,
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

export function isBun(): boolean {
  return detectRuntime() === 'bun';
}

export function isDeno(): boolean {
  return detectRuntime() === 'deno';
}
