/**
 * Minimal zero-dependency static file server for local development.
 * ES modules cannot be loaded from file://, so the app must be served over HTTP.
 *
 * Usage: npm run serve   (then open the printed URL)
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = normalize(join(ROOT, urlPath));

    // Prevent path traversal outside the project root
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    if (urlPath.endsWith('/')) {
        filePath = join(filePath, 'index.html');
    }

    try {
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    } catch {
        res.writeHead(404).end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`GoVacuum dev server running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop.');
});
