import type { ConfigContext, ExpoConfig } from 'expo/config';

const BUNDLE_ID = 'com.catchlog.catchlog';

// Google Sign-In on iOS needs the *reversed* iOS client ID registered as a URL scheme.
// "1234-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.1234-abc"
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleIosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

if (!googleIosUrlScheme) {
  console.warn('[app.config] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set; Google Sign-In will not work on iOS builds.');
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CatchLog',
  slug: 'catchlog',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'catchlog',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    icon: './assets/images/icon.png', // made by scripts/make-icons.py
    supportsTablet: false,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#1C3A2E',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#1C3A2E', image: './assets/images/splash-icon.png', imageWidth: 120 },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'CatchLog uses the camera to photograph your catches.',
        photosPermission: 'CatchLog lets you attach catch photos from your library.',
        microphonePermission: false,
      },
    ],
    [
      'expo-location',
      { locationWhenInUsePermission: 'CatchLog tags each catch with where you caught it and the local weather.' },
    ],
    ...(googleIosUrlScheme
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, object]]
      : []),
    '@react-native-community/datetimepicker',
    '@maplibre/maplibre-react-native',
    './plugins/withReleaseSigning',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
