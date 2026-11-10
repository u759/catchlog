// Signs Android release builds with our own key instead of the public debug key.
// The key + passwords live in the gitignored, EAS-format credentials.json at the project root,
// so the same key can be used by local builds and by EAS (credentialsSource: "local").
// If credentials.json is missing, release builds fall back to the debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @catchlog release-signing';

const header = `${MARKER}
def catchlogCredsFile = new File(rootDir, "../credentials.json")
def catchlogReleaseCreds = catchlogCredsFile.exists() ? new groovy.json.JsonSlurper().parse(catchlogCredsFile).android.keystore : null
`;

const releaseConfig = `signingConfigs {
        if (catchlogReleaseCreds != null) {
            release {
                storeFile new File(rootDir, "../" + catchlogReleaseCreds.keystorePath)
                storePassword catchlogReleaseCreds.keystorePassword
                keyAlias catchlogReleaseCreds.keyAlias
                keyPassword catchlogReleaseCreds.keyPassword
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const releaseSigningLine = /(release \{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/;
    if (!src.includes('signingConfigs {') || !releaseSigningLine.test(src)) {
      throw new Error('[withReleaseSigning] android/app/build.gradle layout changed; update the plugin.');
    }

    src = src.replace(/^android \{/m, `${header}\nandroid {`);
    src = src.replace('signingConfigs {', releaseConfig);
    src = src.replace(
      releaseSigningLine,
      '$1signingConfig catchlogReleaseCreds != null ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
