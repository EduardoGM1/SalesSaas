import http from 'http';
import fs from 'fs';
import path from 'path';

const root = path.resolve(new URL(import.meta.url).pathname, '..', '..', 'apps', 'web', 'dist');
const port = process.env.PORT || 5000;

function contentType(ext) {
  switch (ext) {
    case '.html': return 'text/html';
    case '.js': return 'application/javascript';
    case '.css': return 'text/css';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) { res.writeHead(302, { Location: '/' }); res.end(); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': contentType(ext) });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500); res.end(String(err));
  }
});

server.listen(port, () => console.log('serve-dist listening on', port));

// graceful
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
