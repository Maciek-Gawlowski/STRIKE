import Constants from "expo-constants";

/**
 * Which version of the app is this.
 *
 * Two screens showed the build number by reading it straight out of
 * `Constants.expoConfig.ios.buildNumber`, which reads app.json — and app.json
 * no longer carries a buildNumber, because versioning moved to EAS with
 * autoIncrement. So the number rendered as an em dash, and every feedback
 * message from every tester would have arrived stamped "—" during a week when
 * several builds are in circulation.
 *
 * There is no way to invent the number if the platform does not expose it, so
 * this does two honest things instead: it tries every place it can legitimately
 * appear, and when it genuinely cannot be resolved it says which situation it
 * is in rather than printing a dash that could mean either.
 */

type Manifest2 = {
  extra?: { expoClient?: { ios?: { buildNumber?: string }; android?: { versionCode?: number } } };
};

/** True when running inside Expo Go rather than a build of our own. */
export const isExpoGo = Constants.appOwnership === "expo";

export const appVersion: string =
  Constants.expoConfig?.version ?? (Constants as { manifest2?: { extra?: { expoClient?: { version?: string } } } }).manifest2?.extra?.expoClient?.version ?? "?";

function resolveBuildNumber(): string | null {
  const fromConfig =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null);
  if (fromConfig) return String(fromConfig);

  const m2 = (Constants as { manifest2?: Manifest2 }).manifest2?.extra?.expoClient;
  const fromManifest =
    m2?.ios?.buildNumber ?? (m2?.android?.versionCode != null ? String(m2.android.versionCode) : null);
  return fromManifest ? String(fromManifest) : null;
}

const resolved = resolveBuildNumber();

/**
 * Printable build number. "dev" inside Expo Go, where there is no build to
 * number; "unknown" in a real build, which is a bug worth seeing rather than
 * a dash that looks like a design choice.
 */
export const appBuild: string = resolved ?? (isExpoGo ? "dev" : "unknown");

if (!resolved && !isExpoGo) {
  console.warn(
    "[strike/appInfo] build number unresolved in a packaged build — feedback will not " +
      "say which build it came from. Check EAS remote versioning."
  );
}

/** One line for feedback and the about block: "0.1.0 (32)". */
export const appVersionLabel = `${appVersion} (${appBuild})`;
