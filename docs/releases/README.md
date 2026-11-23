# Release and rollback guide

The latest public preview is [4.6.6 Beta](https://github.com/clark970417-eng/VocaLume/releases/tag/beta-v4.6.6). See the [4.6.6 release notes](4.6.6.md), [installation guide](../installation.md) and [changelog](../../CHANGELOG.md).

VocaLume uses two release channels:

- **Beta** tags use `beta-vX.Y.Z`. They are public previews and may be unsigned.
- **Stable** tags use `vX.Y.Z`. Stable automation requires configured Apple and Windows signing credentials and stops before publishing when either is missing.

Every published release must pass extension and desktop tests before its files are attached. Each release includes:

- `SHA256SUMS.txt` for download verification.
- `release-manifest.json` with the source commit, build time, workflow, channel, and signing state.
- Release notes explaining what changed and which files to download.

## Roll back

1. Stop translation and quit the desktop app.
2. Open the repository's **Releases** page and select the last version that worked.
3. Download the installer for your operating system and the matching extension if you use it.
4. Compare the file's SHA-256 value with that release's `SHA256SUMS.txt`.
5. Install the older version in the same location. Replace the extension files in the same folder, reload the extension and refresh open pages. This keeps user settings and downloaded models.
6. In **App Updates**, select **Stable** to stop receiving Beta builds.

If the app cannot open, reinstalling does not delete user data. Uninstallers are configured to retain app data by default.

## Before publishing

1. Update the version and changelog.
2. Run extension tests, desktop type checking, tests, and production build.
3. Publish a Beta first and complete the live-service checklist in the [beta testing guide](../beta-testing.md).
4. Promote with a stable `vX.Y.Z` tag only after unresolved blocking issues are closed.
5. Verify every expected asset, `SHA256SUMS.txt`, and `release-manifest.json` on the release page.

## 4.2.1 verification completed

- Extension: 129 tests passed.
- Desktop: 668 tests passed.
- TypeScript checks and production build passed.
- The locally packaged macOS application passed deep code-signature verification.
- Opera GX loaded extension 4.2.1, connected to desktop 4.2.1, started tab capture, loaded the desktop model, stopped cleanly, and returned to ready.
- Facebook access and the all-websites manifest path were verified without posting or changing user content.
