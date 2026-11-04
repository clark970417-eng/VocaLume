# Packaging dependency security repair — 2026-11-04

The 4.6.1 cross-platform build was blocked by GHSA-g3hv-75wg-m249 (minimatch). This update preserves `npm audit --audit-level=moderate` and updates the dependency graph instead of allowlisting the advisory.

## Compatibility and versions

- minimatch 11.0.4 replaces vulnerable glob-pattern parsing.
- glob 14.0.3 addresses GHSA-3g3m-2fjr-6pw4; only glob >=9 is overridden because its promise API cannot replace legacy callback consumers directly.
- @electron/asar 4.3.1 and @electron/universal 3.0.6 use modern matching interfaces. Their Node requirement is satisfied by Node >=22.12.0 in this project.
- filelist 2.0.2 updates Jake/EJS's matching consumer.
- electron-winstaller still depended on temp/rimraf/glob 7. A blind minimatch override broke its glob regex assumptions. `desktop-app/vendor/temp` retains the MIT upstream temp 0.9.4 API, replacing only removal and recursive directory creation with Node native fs APIs. It has no runtime dependencies. It is a development-only root dependency so `npm ci` resolves the local override portably.
- Existing sharp and simple-git security overrides remain unchanged.

Remove these temporary overrides as upstream tools adopt compatible patched versions. Do not remove the security gate to make a build green.

## Verification

`desktop-app/scripts/verify-packaging-toolchain.cjs` exercises ASAR creation/read/unpack (including hidden files), electron-builder archive validation and file patterns, FileList/EJS rendering, universal module loading, and the actual installer consumer's promisified mkdir plus asynchronous/synchronous cleanup. It uses tiny fixtures and never starts translation models. The release workflow runs it after the audit on macOS, Windows and Linux.

Local checks: complete npm audit 0 advisories; packaging compatibility pass; ESLint, TypeScript, 858 tests and production build passed. Cross-platform package results must be checked in the linked GitHub workflow before publication. These checks do not claim physical hardware or live translation accuracy qualification.

Sources: https://github.com/advisories/GHSA-g3hv-75wg-m249 and https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 .

Cross-platform qualification build: https://github.com/clark970417-eng/VocaLume/actions/runs/41748159779 . Extension, macOS (arm64/x64), Windows x64 and Linux x64 jobs all succeeded, including the audit and compatibility checks. A separate tag-triggered workflow performs final release packaging and publication.

Final tag release: https://github.com/clark970417-eng/VocaLume/actions/runs/41749560727 . All jobs, complete-asset validation and release publication succeeded. Public packages: https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.2 .
