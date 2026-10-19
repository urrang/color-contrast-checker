import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { resolve, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
createServer(async (request, response) => {
    const path = resolve(
        root,
        '.' + new URL(request.url, 'http://localhost').pathname,
    );
    if (!path.startsWith(root + sep) && path !== root) {
        response.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(
            path === root ? resolve(root, 'index.html') : path,
        );
        response.setHeader(
            'Content-Type',
            path.endsWith('.js') ? 'text/javascript' : 'text/html',
        );
        response.end(body);
    } catch {
        response.writeHead(404).end();
    }
}).listen(4173, '127.0.0.1');
