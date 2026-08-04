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
