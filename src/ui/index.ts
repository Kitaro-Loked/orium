/**
 * Orium - UI Module (Production Ready)
 * Serves static web UI files with proper error handling, security, and deployment support.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
// ── Path Resolution ───────────────────────────────────────────────

// Get current directory safely (works in both ESM and CJS)
function getCurrentDir(): string {
  try {
    // Try to detect if we're in dist/ or src/
    if (typeof __dirname !== 'undefined') {
      // In CJS, __dirname is available
      // If we're in dist/src/ui, go up to project root
      if (__dirname.includes('dist')) {
        return resolve(__dirname, '..', '..');
      }
      return __dirname;
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

/**
 * Resolve UI directory with multiple fallback strategies:
 * 1. ORIUM_UI_PATH environment variable
 * 2. From module path (dist/ui → ../ui or ../../src/ui)
 * 3. From process.cwd() (development)
 */
function resolveUIPath(): string {
  // 1. Environment variable override
  if (process.env.ORIUM_UI_PATH) {
    const envPath = resolve(process.env.ORIUM_UI_PATH);
    if (existsSync(envPath)) return envPath;
    console.warn(`[UI] ORIUM_UI_PATH set but not found: ${envPath}`);
  }

  // 2. From compiled module location
  // When compiled to dist/src/ui/index.js, we need to find src/ui
  const currentDir = getCurrentDir();
  const modulePaths = [
    resolve(currentDir, 'src', 'ui'),           // project-root/src/ui
    resolve(currentDir, '..', 'src', 'ui'),     // from dist/src/ui → ../src/ui
    resolve(currentDir, '..', '..', 'src', 'ui'), // from dist/src/ui → ../../src/ui
    resolve(currentDir),                        // direct
  ];
  for (const p of modulePaths) {
    if (existsSync(p)) return p;
  }

  // 3. From project root (development)
  const devPath = resolve(process.cwd(), 'src', 'ui');
  if (existsSync(devPath)) return devPath;

  // 4. Last resort - return cwd-based so errors are clear
  console.warn(`[UI] Could not find UI directory. Using fallback: ${devPath}`);
  return devPath;
}

const UI_DIR = resolveUIPath();
const UI_V2_DIR = resolve(UI_DIR, 'v2');
const UI_V3_DIR = resolve(UI_DIR, 'v3');

// ── MIME Types ────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  // Documents
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',

  // Styles
  '.css': 'text/css; charset=utf-8',
  '.scss': 'text/x-scss; charset=utf-8',
  '.sass': 'text/x-sass; charset=utf-8',
  '.less': 'text/x-less; charset=utf-8',

  // Scripts
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.ts': 'application/typescript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',

  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',

  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',

  // Media
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',

  // Archives
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',

  // Default
  '': 'application/octet-stream',
};

// ── Logger ────────────────────────────────────────────────────────

const isDebug = process.env.DEBUG === '1' || process.env.ORIUM_DEBUG === '1';

function logDebug(msg: string, data?: unknown): void {
  if (isDebug) console.log(`[UI] ${msg}`, data ?? '');
}

function logWarn(msg: string, data?: unknown): void {
  console.warn(`[UI] ⚠️  ${msg}`, data ?? '');
}

function logError(msg: string, err?: unknown): void {
  console.error(`[UI] ❌ ${msg}`, err ?? '');
}

// ── Main Export ───────────────────────────────────────────────────

export interface UIServeOptions {
  cache?: boolean;
  cacheMaxAge?: number;
}

export function serveUI(
  req: IncomingMessage,
  res: ServerResponse,
  options: UIServeOptions = {}
): boolean {
  const url = req.url || '/';
  const { cache = true, cacheMaxAge = 3600 } = options;

  // Handle /ui/v3/* → latest UI
  if (url.startsWith('/ui/v3')) {
    return serveUIVersion(req, res, UI_V3_DIR, url.slice(7), 'v3', { cache, cacheMaxAge });
  }

  // Handle /ui/v2/* → legacy UI
  if (url.startsWith('/ui/v2')) {
    return serveUIVersion(req, res, UI_V2_DIR, url.slice(7), 'v2', { cache, cacheMaxAge });
  }

  // Handle /ui/* → original UI
  if (url.startsWith('/ui')) {
    return serveUIVersion(req, res, UI_DIR, url.slice(3), 'default', { cache, cacheMaxAge });
  }

  // Redirect root to UI
  if (url === '/') {
    logDebug('Redirecting / → /ui/v3/');
    res.writeHead(302, { Location: '/ui/v3/' });
    res.end();
    return true;
  }

  return false;
}

// ── Version Serving ───────────────────────────────────────────────

function serveUIVersion(
  req: IncomingMessage,
  res: ServerResponse,
  baseDir: string,
  filePath: string,
  version: string,
  options: UIServeOptions
): boolean {
  let normalizedPath = filePath;
  if (normalizedPath === '/' || normalizedPath === '') {
    normalizedPath = '/index.html';
  }

  logDebug(`Serving ${version}: ${normalizedPath}`);

  // Security: prevent directory traversal
  if (normalizedPath.includes('..') || normalizedPath.includes('//')) {
    logWarn(`Directory traversal blocked: ${normalizedPath}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  const fullPath = resolve(baseDir, normalizedPath.slice(1));

  // Double-check path is within baseDir
  if (!fullPath.startsWith(baseDir)) {
    logWarn(`Path escape blocked: ${fullPath}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return true;
  }

  try {
    if (!existsSync(fullPath)) {
      logDebug(`File not found: ${fullPath}`);

      // SPA fallback: try index.html for client-side routes
      if (!normalizedPath.endsWith('.html')) {
        const indexPath = resolve(baseDir, 'index.html');
        if (existsSync(indexPath)) {
          logDebug(`SPA fallback to index.html for: ${normalizedPath}`);
          return serveFile(indexPath, res, options);
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not Found',
        path: normalizedPath,
        version,
      }));
      return true;
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const indexPath = resolve(fullPath, 'index.html');
      if (existsSync(indexPath)) {
        return serveFile(indexPath, res, options);
      }
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Directory listing disabled' }));
      return true;
    }

    return serveFile(fullPath, res, options);
  } catch (err) {
    logError(`Error serving ${normalizedPath}`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      details: isDebug ? String(err) : undefined,
    }));
    return true;
  }
}

// ── File Serving ──────────────────────────────────────────────────

function serveFile(
  filePath: string,
  res: ServerResponse,
  options: UIServeOptions
): boolean {
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || MIME_TYPES[''];

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(content.length),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    };

    // Cache strategy by file type
    if (options.cache) {
      const maxAge = options.cacheMaxAge ?? 3600;
      if (ext === '.html') {
        headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
      } else if (['.js', '.css', '.mjs'].includes(ext)) {
        headers['Cache-Control'] = `public, max-age=${maxAge * 10}`;
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.otf'].includes(ext)) {
        headers['Cache-Control'] = `public, max-age=${maxAge * 100}`;
      } else {
        headers['Cache-Control'] = `public, max-age=${options.cacheMaxAge}`;
      }
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    res.writeHead(200, headers);
    res.end(content);
    return true;
  } catch (err) {
    logError(`Error reading file ${filePath}`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
    return true;
  }
}

// ── Diagnostics ───────────────────────────────────────────────────

export function diagnoseUI(): {
  status: 'ok' | 'warning' | 'error';
  paths: Record<string, { path: string; exists: boolean }>;
  recommendations: string[];
} {
  const paths: Record<string, { path: string; exists: boolean }> = {
    'UI Base': { path: UI_DIR, exists: existsSync(UI_DIR) },
    'UI V3': { path: UI_V3_DIR, exists: existsSync(UI_V3_DIR) },
    'UI V3 Index': { path: resolve(UI_V3_DIR, 'index.html'), exists: existsSync(resolve(UI_V3_DIR, 'index.html')) },
    'UI V2': { path: UI_V2_DIR, exists: existsSync(UI_V2_DIR) },
    'UI V2 Index': { path: resolve(UI_V2_DIR, 'index.html'), exists: existsSync(resolve(UI_V2_DIR, 'index.html')) },
  };

  const recommendations: string[] = [];

  if (!paths['UI Base'].exists) {
    recommendations.push(`UI Base path not found: ${UI_DIR}`);
    recommendations.push('Set ORIUM_UI_PATH env var to the correct path');
  }
  if (!paths['UI V3 Index'].exists) {
    recommendations.push(`UI V3 index.html not found: ${paths['UI V3 Index'].path}`);
    recommendations.push('Ensure UI files are included in your deployment');
  }

  const status = recommendations.length === 0
    ? 'ok'
    : paths['UI V3 Index'].exists
      ? 'warning'
      : 'error';

  return { status, paths, recommendations };
}

export function getUIPath(): string { return UI_DIR; }
export function getUIVersion3Path(): string { return UI_V3_DIR; }
export function getUIVersion2Path(): string { return UI_V2_DIR; }
