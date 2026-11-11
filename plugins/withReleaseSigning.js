// Optional release signing. If these env vars exist at `expo prebuild` time (CI sets them from GitHub Secrets),
// the release APK is signed with YOUR keystore instead of the shared debug one:
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
// Without them nothing changes (debug keystore), so local builds keep working.
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (!process.env.ANDROID_KEYSTORE_PATH) return c;
    let g = c.modResults.contents;
    if (g.includes('releaseKeystore')) return c;
    const block = `signingConfigs {
        releaseKeystore {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`;
    if (!/signingConfigs\s*\{/.test(g)) throw new Error('withReleaseSigning: signingConfigs block not found in build.gradle');
    g = g.replace(/signingConfigs\s*\{/, block);
    // point ONLY the release build type at the new config
    g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.releaseKeystore');
    if (!g.includes('signingConfigs.releaseKeystore')) throw new Error('withReleaseSigning: release buildType not found');
    c.modResults.contents = g;
    return c;
  });
