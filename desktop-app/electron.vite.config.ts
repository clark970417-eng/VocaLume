import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { createRequire } from 'node:module'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Intercept ONNX Runtime .mjs dynamic imports at the module resolution level.
// ONNX Runtime loads /vad/ort-wasm-simd-threaded.mjs via dynamic import(),
// which Vite tries to transform. We resolve it to the actual file in node_modules
// and load it directly, bypassing Vite's transform pipeline.
function serveOrtWasm(): Plugin {
  const require = createRequire(resolve(__dirname, 'package.json'))
  const vadDist = dirname(require.resolve('@ricky0123/vad-web'))
  const loader = require.resolve('onnxruntime-web/ort-wasm-simd-threaded.mjs', { paths: [vadDist] })
  return {
    name: 'serve-ort-wasm',
    enforce: 'pre',
    resolveId(id) {
      if (id.split('?')[0] === '/vad/ort-wasm-simd-threaded.mjs') return loader
    },
    load(id) {
      // Serve ORT files from node_modules as-is without transformation
      if (id === loader) return readFileSync(id, 'utf-8')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'gpu-probe': resolve(__dirname, 'src/main/gpu-probe.ts'),
          'whisper-worker': resolve(__dirname, 'src/main/whisper-worker.ts'),
          'sensevoice-worker': resolve(__dirname, 'src/main/sensevoice-worker.ts'),
          'audio-analysis-worker': resolve(__dirname, 'src/main/audio-analysis-worker.ts'),
          'slm-worker': resolve(__dirname, 'src/main/slm-worker.ts')
        }
      },
      rollupOptions: {
        external: ['node-llama-cpp', 'electron-audio-loopback', 'naudiodon', 'sherpa-onnx-node']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [
      serveOrtWasm(),
      react()
    ],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
