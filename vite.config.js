import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// In development the page can read your shot list and models:
//   /__shots      -> shots.json (or the file in COOLRENDER_SHOTS)
//   /models/<f>   -> models/<f>
// The deployed site (GitHub Pages) has neither and works from drag and drop.
function shotFiles() {
  return {
    name: 'coolrender-shots',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent(req.url.split('?')[0]);
        if (url === '/__shots') {
          const file = path.resolve(process.env.COOLRENDER_SHOTS || 'shots.json');
          if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('[]'); }
          res.setHeader('Content-Type', 'application/json');
          return res.end(fs.readFileSync(file));
        }
        if (url.startsWith('/models/')) {
          const root = path.resolve('models');
          const file = path.resolve(root, url.slice('/models/'.length));
          if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
          return res.end(fs.readFileSync(file));
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 3100 },
  plugins: [shotFiles()],
  build: { target: 'es2022' }, // top-level await
  // Pre-bundle up front so the headless renderer never sees a mid-run page reload.
  optimizeDeps: {
    entries: ['index.html', 'scripts/lib/*.js'],
    include: ['three', 'meshoptimizer', 'mediabunny', 'fflate', 'three-mesh-bvh'],
  },
});
