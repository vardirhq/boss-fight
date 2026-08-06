# Versioning And Releases

Boss Kamp uses two release numbers:

- `package.json.version`: public app version name, semver-style.
- `deploid.config.mjs android.version.code`: Android monotonic integer update
  code.

For every production Android release:

1. Update `package.json.version`.
2. Update `deploid.config.mjs android.version.name` to the same value.
3. Increment `deploid.config.mjs android.version.code`.
4. Add a matching `CHANGELOG.md` section:

   ```md
   ## [1.1.0] - YYYY-MM-DD
   ```

5. Push a tag matching the version:

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

The `Android signed release` workflow verifies that:

- the tag is exactly `v${package.json.version}`
- `android.version.name` matches `package.json.version`
- `android.version.code` is a positive integer
- `CHANGELOG.md` has notes for the version

The workflow creates a GitHub Release and attaches:

- `boss-kamp-release.apk`
- `boss-kamp-release.aab`

Manual releases can be run from GitHub Actions with the `release_tag` input.
The input must still match `v${package.json.version}`.

## In-app update discovery

Because releases are installed as a signed APK rather than through a store, an
installed copy has no way to learn that a newer build exists. The app therefore
checks for one itself:

- The build's own version is injected from `package.json` at build time
  (`__APP_VERSION__`, defined in `vite.config.ts`) and shown at the bottom of
  Settings.
- On launch — at most once every 24 hours — the app calls `GET /api/meta` on its own
  API. The API reads the latest GitHub release server-side and caches it, so the app
  never contacts GitHub directly and its content security policy stays limited to its
  own origin.
- If the release is strictly newer, a banner offers a direct link to the attached
  APK. Dismissal is remembered per version, so the next release announces itself
  again.

Two consequences worth knowing:

- **The version must be bumped for the banner to work.** A release whose
  `package.json.version` was not raised looks identical to the installed build and is
  never offered. The release workflow already enforces that the tag,
  `package.json.version`, and `android.version.name` agree.
- **Android cannot install the update by itself.** The app holds only the `INTERNET`
  permission, so the link hands off to the browser, which downloads the APK; Android
  then asks the user to confirm the install. Silent updates would need
  `REQUEST_INSTALL_PACKAGES` — and would still prompt — or a store listing.
