# Source and development guide

New users should start with the [installation guide](installation.md).

```text
VocaLume/
├── README.md                 English quick start
├── CHANGELOG.md              User-facing version history
├── extension/                Browser runtime, icons, VAD resources and tests
│   ├── manifest.json         Load this folder for a new unpacked installation
│   ├── desktop/              Mac native messaging installer and relay
│   └── tests/                Regression cases and browser fixtures
├── desktop-app/              Electron App, local engines and benchmarks
├── docs/
│   ├── installation.md       First installation and updates
│   ├── legal/                Privacy and third-party notices
│   ├── quality/              Fixed corpus, human review and device qualification
│   ├── releases/             Release notes and rollback instructions
│   ├── retests/              Recorded verification evidence
│   ├── archive/              Historical handoffs and comparisons
│   └── brand/                Logo and icon assets
├── scripts/                  Packaging and maintenance
└── .github/                  CI and issue forms
```

Models, API keys, personal recordings, `.test-out` and built installers are not committed. Published extension ZIPs contain the runtime, connection installer and standalone guides; they exclude development tests and historical reports.

## Local checks

Requires Node.js 22.12 or later. These commands do not call paid APIs:

```sh
node --test extension/tests/*.test.mjs
cd desktop-app
npm ci
npm run typecheck
npm test -- --run
npm run build
```

See [quality evaluation](quality/README.md) for model measurements. The browser fixture is `extension/tests/capture.html`; when the extension folder is loaded, open `chrome-extension://YOUR_ID/tests/capture.html`. It uses authored synthetic audio and never posts a message.

Native bridge regression tests use Python 3.11 with NumPy 2.4.6. From the repository root, run `python -m unittest discover -s extension/desktop -p 'test_*.py'` in that Python environment. These checks use a mocked recognition model and do not download model weights or call an API. CI runs them alongside the extension tests.

## Existing root-loaded Opera installations

Older local checkouts loaded the repository root rather than `extension/`. Moving that installation would change its ID. On those existing Mac checkouts only, `node scripts/link-legacy-extension.mjs` creates ignored local symbolic links from the old paths to the new source directory. `--check` verifies them. It refuses to replace an existing file and does not edit the browser profile. The root remains the existing installation location; new users should load `extension/`.

CI and clean-checkout tests use the new paths directly, without these compatibility aliases. The aliases are local and are not uploaded to GitHub or included in releases.

## Releases

App, extension and lockfile versions must match. Check with `node scripts/check-release-version.mjs beta-v4.6.0`. A `beta-v*` tag builds unsigned previews for all configured platforms and publishes only after required assets pass validation. Stable `v*` releases additionally require signing credentials.

`scripts/verify-release-assets.mjs` verifies seven required packages, the extension version and native-host dependencies before generating provenance and checksums. `scripts/package-guides.mjs` turns relative documentation links into web links for the standalone ZIP. Keep README download versions and `docs/releases/VERSION.md` current.

The desktop component preserves the [upstream MIT license](../desktop-app/LICENSE). Other component and model licenses are described in [third-party notices](legal/third-party-notices.md).
