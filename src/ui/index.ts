/**
 * Orium - UI Module
 * Serves static web UI files.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const UI_DIR = resolve(process.cwd(), 'src', 'ui');
const UI_V2_DIR = resolve(process.cwd(), 'src', 'ui', 'v2');
const UI_V3_DIR = resolve(process.cwd(), 'src', 'ui', 'v3');

export function serveUI(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url || '/';

  // Handle /ui/v3/* paths -> serve v3 UI (default)
  if (url.startsWith('/ui/v3')) {
    let filePath = url.slice(6); // Remove /ui/v3
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    if (filePath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    const fullPath = resolve(UI_V3_DIR, filePath.slice(1));

    try {
      const content = readFileSync(fullPath);
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(content);
      return true;
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
  }

  // Handle /ui/v2/* paths -> serve v2 UI
  if (url.startsWith('/ui/v2')) {
    let filePath = url.slice(6); // Remove /ui/v2
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    if (filePath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    const fullPath = resolve(UI_V2_DIR, filePath.slice(1));

    try {
      const content = readFileSync(fullPath);
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(content);
      return true;
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
  }

  // Handle /ui/* paths -> serve original UI
  if (!url.startsWith('/ui')) return false;

  let filePath = url.slice(3); // Remove /ui
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  const fullPath = resolve(UI_DIR, filePath.slice(1));

  try {
    const content = readFileSync(fullPath);
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(content);
    return true;
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return true;
  }
}

export function getUIPath(): string {
  return UI_DIR;
}
