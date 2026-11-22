import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const app = createApp();
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 5174;
app.listen(port, () => {
  console.log(`[sethu] API listening on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sethu] Demo login: 9000000000 / demo1234   Admin: 9999999999 / admin1234 (dev only)');
  }
});
