# Android Release Signing

Boss Kamp release builds are signed in GitHub Actions with an Android upload
keystore.

## Keystore

The upload keystore was generated once with alias:

```text
boss-kamp
```

The root-only backup on the production server is:

```text
/root/boss-kamp-android-signing/boss-kamp-upload.jks
```

The root-only credential backup is:

```text
/root/boss-kamp-android-signing/credentials.txt
```

Back this directory up permanently outside the VPS. Losing the keystore means
future APKs cannot update installs signed with the original key.

## GitHub Secrets

The release workflow requires:

```text
BOSS_KAMP_ANDROID_KEYSTORE_BASE64
DEPLOID_ANDROID_STORE_PASSWORD
DEPLOID_ANDROID_KEY_PASSWORD
```

These are configured in `vardirhq/boss-fight`.

## Release Workflow

Run the manual workflow:

```text
Android signed release
```

or push a matching version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

It restores the keystore into:

```text
secrets/boss-kamp-upload.jks
```

then builds:

```text
boss-kamp-release.apk
boss-kamp-release.aab
```

Both artifacts are uploaded to the workflow run.

The same artifacts are also attached to the matching GitHub Release.

The release tag must match `package.json.version`, prefixed with `v`.

## Version Codes

Increment `android.version.code` in `deploid.config.mjs` before every production
update. Android requires each update to have a higher version code than the
installed build.

Current version:

```text
version code: 1
version name: 1.0.0
```
