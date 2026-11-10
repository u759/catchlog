import { loadProjectEnv } from "@expo/env";
import type { ConfigContext, ExpoConfig } from "expo/config";

const BUNDLE_ID = "com.catchlog.catchlog";

/** Google Sign-In on iOS needs the *reversed* iOS client ID as a URL scheme ("1234-abc.apps.googleusercontent.com"
 * -> "com.googleusercontent.apps.1234-abc"). */
function googleIosUrlScheme() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) {
    console.warn(
      "[app.config] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set; Google Sign-In will not work on iOS builds.",
    );
    return undefined;
  }
  return `com.googleusercontent.apps.${iosClientId.replace(".apps.googleusercontent.com", "")}`;
}

export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  // Expo CLI loads .env itself, but EAS CLI evaluates this file without it; load it here so every tool sees the
  // same EXPO_PUBLIC_* values.
  loadProjectEnv(projectRoot, { silent: true });
  const iosUrlScheme = googleIosUrlScheme();
  return {
    ...config,
    name: "CatchLog",
    slug: "catchlog",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "catchlog",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: BUNDLE_ID,
      // Only standard HTTPS: answers App Store Connect's export-compliance question for every build.
      config: { usesNonExemptEncryption: false },
      icon: "./assets/images/icon.png", // made by scripts/make-icons.py
      supportsTablet: false,
    },
    android: {
      package: BUNDLE_ID,
      adaptiveIcon: {
        backgroundColor: "#1C3A2E",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#1C3A2E",
          image: "./assets/images/splash-icon.png",
          imageWidth: 120,
        },
      ],
      [
        "expo-image-picker",
        {
          cameraPermission:
            "CatchLog uses the camera to photograph your catches.",
          photosPermission:
            "CatchLog lets you attach catch photos from your library.",
          microphonePermission: false,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "CatchLog tags each catch with where you caught it and the local weather.",
        },
      ],
      ...(iosUrlScheme
        ? [
            ["@react-native-google-signin/google-signin", { iosUrlScheme }] as [
              string,
              object,
            ],
          ]
        : []),
      "@react-native-community/datetimepicker",
      "@maplibre/maplibre-react-native",
      "./plugins/withReleaseSigning",
    ],
    extra: {
      eas: { projectId: "d4de49d0-f6d3-4bf9-926a-72f8aee72f25" },
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
