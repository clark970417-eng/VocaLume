# temp compatibility patch for build tooling

Based on MIT-licensed `temp@0.9.4` (https://github.com/bruce/node-temp). The original LICENSE is retained.

Changes: replace legacy rimraf removal with Node.js `fs.rm` / `fs.rmSync` and mkdirp with native recursive `fs.mkdir`, preserving callback cleanup and retry behavior for generated temporary paths. This removes the obsolete glob 7 / minimatch API chain used by electron-winstaller. It is a development-only dependency, not a translation engine.

The full upstream temp API remains present, including tracking, async/sync cleanup, file creation and directory creation. Node 22.12+ is required by the application toolchain. Remove this override when upstream replaces its legacy cleanup dependency. Regression checks in `scripts/verify-packaging-toolchain.cjs` exercise the actual consumer's promisified mkdir and both cleanup paths.
