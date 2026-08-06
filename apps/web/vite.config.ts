import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const configuredBase = process.env.VITE_BASE_PATH?.trim();
const base = configuredBase
  ? (configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`)
  : '/app/';

export default defineConfig({
  // Relative base so a built bundle works from any path on the offline demo
  // server, which is not guaranteed to be mounted at the domain root.
  // Absolute, because the panel bundle is loaded by the globe page at '/' while
  // its own chunks and textures live under '/app/'. A relative base would make
  // the browser look for them at the site root.
  // The combined local and hosted site mounts this panel at /app/. A separate
  // standalone dashboard can opt into / with VITE_BASE_PATH=/.
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // The canonical contract is read from its committed location rather than
      // copied in. A copy is a second source of truth that drifts silently.
      '@contract': path.resolve(repoRoot, 'packages', 'contracts', 'schemas'),
      '@fixtures': path.resolve(repoRoot, 'contracts', 'examples'),
      // The globe reuses the scattering shaders and Earth textures already
      // committed under orbital-website/ rather than copying 3.3 MB of assets
      // into a second place. Everything referenced through these aliases lands
      // in the lazy globe chunk, never in the analytical bundle.
      '@globe': path.resolve(repoRoot, 'orbital-website'),
      // Licence and attribution are read from the validated boundary record,
      // never retyped here. A hand-copied licence string is one that drifts
      // from the record it is supposed to be reproducing — and for an ODbL
      // source with share-alike obligations, drifting is a compliance problem
      // rather than a cosmetic one.
      // Validated district geometry — the real polygons the pipeline gated.
      '@validated': path.resolve(
        repoRoot, 'data', 'validated', 'boundaries', 'geoBoundaries-IND-ADM2-76128533',
      ),
      '@global-boundaries': path.resolve(
        repoRoot, 'data', 'validated', 'boundaries', 'global',
      ),
      '@boundaries': path.resolve(
        repoRoot, 'data', 'metadata', 'boundaries', 'geoBoundaries-IND-ADM2-76128533',
      ),
      '@citycatalog': path.resolve(repoRoot, 'data', 'catalog'),
    },
  },
  server: {
    port: 5173,
    // 5173 is one of the API's default allowed origins (apps/api/app/config.py)
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    // Public production artifacts must not expose the original source tree.
    // Developers can opt into maps for a controlled diagnostic build.
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    rollupOptions: {
      output: {
        // Stable names: orbital-website/index.html references these by hand and
        // it is a build-free page, so it cannot read a manifest for a hash.
        entryFileNames: 'sparc-panel.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'sparc-panel.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
