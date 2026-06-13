import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import renderer from 'vite-plugin-electron-renderer'
const projectRoot = path.resolve(__dirname); // Don't like this, once we have a better separation of renderer and backend we should remove it

export default defineConfig({
  main: {
    build: {
      outDir: 'build/main',
      lib: {
        entry: 'src/main.ts',
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rolldownOptions: {
        external: [
          'better-sqlite3',
          '@parcel/watcher',
        ],
      },
    },
    define: {
      __PROJECT_ROOT__: JSON.stringify(projectRoot),
    },
  },
  renderer: {
    root: '.',
    optimizeDeps: {
      exclude: ['better-sqlite3', '@parcel/watcher', 'fs', 'util']
    },
    define: {
      __PROJECT_ROOT__: JSON.stringify(projectRoot),
    },
    build: {
      outDir: 'build/renderer',
      rolldownOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
        },
        external: [
          'better-sqlite3',
          '@parcel/watcher',
          'fs',
          'util', // we really should be doing this not in the renderer
        ],
      },
    },
    plugins: [react(), svgr(), renderer()],
    resolve: {
      alias: {
        '~resources': path.resolve(__dirname, 'resources/'),
        common: path.resolve(__dirname, 'common/'),
        widgets: path.resolve(__dirname, 'widgets/'),
        resources: path.resolve(__dirname, 'resources/'),
        src: path.resolve(__dirname, 'src/'),
        wasm: path.resolve(__dirname, 'wasm/'),
      },
    },
    worker: {
      rolldownOptions: {
        // Tell Vite to leave these alone inside Web Workers too!
        external: [
          'better-sqlite3', 
          'fs', 
          'util', 
          
          '@parcel/watcher',
        ]
      }
    }
  },
})