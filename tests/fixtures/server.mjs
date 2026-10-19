import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const pages = {
    '/': await readFile(new URL('index.html', import.meta.url)),
    '/frame.html': await readFile(new URL('frame.html', import.meta.url)),
};

createServer((request, response) => {
    const page = pages[new URL(request.url, 'http://localhost').pathname];
    response.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
    response.end(page);
}).listen(4173, '127.0.0.1');
