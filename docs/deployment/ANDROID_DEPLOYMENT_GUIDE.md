# Android Deployment Guide — Wilsify AI Mobile App

**Audience:** first-time Expo/Android deployer. This guide assumes you have never built an Android app or used Expo before, and explains every step from a clean machine to a Play Store release.

**App facts you'll need throughout this guide** (from `mobile_app/app.json`):

| Setting | Value |
|---|---|
| Package name (Application ID) | `ai.wilsify.app` |
| Target / Compile SDK | 35 (Android 15) |
| Build tools version | 35.0.0 |
| Expo SDK | 54 (React Native 0.76.9) |
| New Architecture | Enabled |

---

## 1. Required Software

Install these in order:

1. **Node.js 22** (not 20, not 24 — the project's `package.json` pins `engines.node: ">=22.0.0"` and the mobile app has been verified against Node 22 specifically). Download from [nodejs.org](https://nodejs.org) or use a version manager:
   ```bash
   nvm install 22
   nvm use 22
   node --version   # confirm v22.x.x
   ```
2. **Git** — to clone the repository, if you haven't already.
3. **Java Development Kit (JDK) 17.** React Native 0.76's Android build tooling (Gradle 8 + Android Gradle Plugin 8) requires JDK 17 specifically — JDK 21 or newer can cause obscure Gradle build failures. Install [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17) (recommended distribution).
4. **Android Studio** — see Section 2.
5. **Watchman** (optional but recommended on macOS/Linux for faster file watching; not needed on Windows).

Verify Java after installing:
```bash
java -version
# Should print: openjdk version "17.x.x"
```

If you have multiple JDKs installed, set `JAVA_HOME` explicitly (see Section 4).

---

## 2. Installing Android Studio

1. Download the current stable release from [developer.android.com/studio](https://developer.android.com/studio). Expo SDK 54 (React Native 0.76) needs a reasonably recent Android Studio — anything released in the last 12 months will include the SDK/tooling versions below. If in doubt, install whatever the site currently marks "stable" (not "canary" or "beta").
2. Run the installer and choose **Standard** install type when prompted — this automatically installs the Android SDK, Android SDK Platform-Tools, and a default emulator system image.
3. On first launch, Android Studio opens the **SDK Manager** setup wizard automatically. Let it finish downloading (this is a multi-GB download; it can take 10–30 minutes depending on your connection).

You do not need to open or use Android Studio's project editor for this app — Expo/EAS handles the actual build. Android Studio here is really just a vehicle for installing the Android SDK, emulator, and platform tools.

---

## 3. SDK Setup

The app requires **compileSdkVersion 35 / targetSdkVersion 35 / buildToolsVersion 35.0.0**. To confirm these are installed:

1. Open Android Studio → **More Actions** (or **Tools** menu if a project is open) → **SDK Manager**.
2. Under the **SDK Platforms** tab, check the box for **Android 15.0 ("VanillaIceCream", API 35)**. Click Apply to install if it isn't already.
3. Under the **SDK Tools** tab, ensure these are checked and installed:
   - **Android SDK Build-Tools 35.0.0**
   - **Android SDK Platform-Tools**
   - **Android Emulator**
   - **Android SDK Command-line Tools (latest)**
4. Note the **Android SDK Location** path shown at the top of this screen (e.g. `C:\Users\<you>\AppData\Local\Android\Sdk` on Windows, `~/Library/Android/sdk` on macOS, `~/Android/Sdk` on Linux) — you'll need it in the next section.

You do **not** need to manually create an Android project or touch Gradle files — `mobile_app/android` (if present) or the EAS-managed build process generates and configures these automatically based on `app.json`.

---

## 4. Environment Variables

Set these two environment variables so the command line (and EAS local builds) can find your Android SDK and JDK:

**Windows (PowerShell, run as your user — persists across sessions):**
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot", "User")
```
Then add `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` to your `PATH` (System Properties → Environment Variables → Path → New).

**macOS / Linux (add to `~/.zshrc` or `~/.bashrc`):**
```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"      # macOS
# export ANDROID_HOME="$HOME/Android/Sdk"            # Linux
export JAVA_HOME=$(/usr/libexec/java_home -v 17)     # macOS; on Linux point this at your JDK 17 install path
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Reload your shell (`source ~/.zshrc` or open a new terminal) and verify:
```bash
echo $ANDROID_HOME    # should print your SDK path
adb --version         # should print Android Debug Bridge version
```

---

## 5. Emulator Setup

1. In Android Studio, open **More Actions** → **Virtual Device Manager** (or **Tools → Device Manager** if a project is open).
2. Click **Create Device**.
3. Pick a phone definition — **Pixel 8** or similar is a safe default.
4. Select a system image with **API Level 35** (Android 15). If it shows a download icon, click it to download the image first (a few GB).
5. Finish the wizard, accepting the default AVD name and settings.
6. Click the ▶ (play) icon next to your new device in the Device Manager to boot the emulator. The first boot takes a minute or two.

With the emulator running, from the `mobile_app/` directory:
```bash
npx expo start
```
Press **`a`** in the terminal to open the app in the running emulator.

**If the emulator is very slow:** ensure hardware acceleration is enabled — Intel HAXM (Intel CPUs) or Android Emulator Hypervisor Driver (AMD CPUs / Windows) must be enabled in your BIOS/UEFI virtualization settings. Android Studio's Device Manager will show a warning if acceleration is unavailable.

---

## 6. Connecting a Real Android Phone

Real-device testing is recommended before any store submission — the emulator won't catch microphone/audio issues that this app depends on (chord detection, tuner, live listening).

1. On the phone: **Settings → About phone** → tap **Build number** 7 times to unlock Developer Options.
2. **Settings → System → Developer options** → enable **USB debugging**.
3. Connect the phone to your computer via USB. Accept the "Allow USB debugging?" prompt on the phone.
4. Verify the connection:
   ```bash
   adb devices
   # Should list your device, e.g.: R58N30ABCDE   device
   ```
5. From `mobile_app/`, run `npx expo start` and press **`a`** — Expo will install and launch on the connected physical device instead of the emulator if only one device/emulator is attached (or prompts you to choose if both are running).

**Alternative — no cable needed:** install the **Expo Go** app from the Play Store on your phone, then scan the QR code shown by `npx expo start` with your phone's camera. This works over Wi-Fi as long as the phone and computer are on the same network. Note: Expo Go is fine for UI development but this app uses native modules (`react-native-iap`, `expo-av` microphone access, `react-native-reanimated`) that require a **development build** (see Section 7) for full functionality — Expo Go alone cannot test payments or some audio features.

---

## 7. Expo & EAS

**Expo** is the framework this app is built on (`mobile_app/` is an Expo Router app). **EAS (Expo Application Services)** is Expo's cloud build service — it builds your native Android/iOS binaries on Expo's servers so you don't need a full native Android/Xcode toolchain locally for release builds.

1. Create a free account at [expo.dev](https://expo.dev) if you don't have one.
2. Install the EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```
3. Log in:
   ```bash
   eas login
   ```
4. From `mobile_app/`, link this project to your Expo account (this generates the real project ID that replaces the `TODO_your-eas-project-uuid-from-expo-dev` placeholder currently in `app.json`):
   ```bash
   cd mobile_app
   npx eas init
   ```
   This writes the real `projectId` into `app.json` automatically. Commit that change.
5. Copy `.env.example` to `.env` and fill in your local/dev API URL (see [ENVIRONMENT.md](ENVIRONMENT.md) for what each variable means):
   ```bash
   cp .env.example .env
   ```

---

## 8. Gradle

You generally never invoke Gradle directly — EAS Build runs it on Expo's servers (cloud builds), and `npx expo start` uses Metro, not Gradle, for local development. Gradle only comes into play if you run a **local** native build (e.g. `npx expo run:android`), which compiles the Android project on your own machine using the JDK 17 and Android SDK you installed in Sections 1–3. If a local Gradle build fails, the two most common causes are: wrong JDK version (must be 17, see Section 1) or a stale Gradle cache — fix the latter with:
```bash
cd mobile_app/android && ./gradlew clean
```
(this folder only exists after running `npx expo prebuild` or `npx expo run:android` at least once — a pure EAS cloud build workflow never needs it.)

---

## 9. Debug Build

A debug build is for local testing — it includes debugging tools and is not optimized or signed for release.

```bash
cd mobile_app
npx expo run:android
```
This builds a debug `.apk`, installs it on a connected device/emulator, and launches it with live reload. Use this while actively developing.

---

## 10. Release Build, APK, and AAB Generation

EAS uses **build profiles** defined in `mobile_app/eas.json`. This project ships three: `development`, `preview`, and `production`.

### Preview build (APK — for sharing with testers directly, not through a store)
```bash
cd mobile_app
eas build --platform android --profile preview
```
This produces a downloadable `.apk` file (per `eas.json`, the `preview` profile sets `"buildType": "apk"`). EAS gives you a URL to download it once the cloud build finishes (typically 10–20 minutes). Install it on a test device by opening that URL on the phone, or downloading it and running `adb install path/to/app.apk`.

### Production build (AAB — for Play Store submission)
```bash
eas build --platform android --profile production
```
This produces an **AAB (Android App Bundle)**, not an APK — the `production` profile sets `"buildType": "aab"`. Play Store requires AAB format for new submissions (Google re-packages it into optimized APKs per device at install time). You cannot `adb install` an AAB directly — it's a store-submission format, not a device-installable one.

**Signing keys:** by default, EAS manages your Android signing key automatically ("remote" credentials) — it generates and stores a keystore for you in the cloud the first time you run a production build, and reuses it for every subsequent build. This is the recommended path for a solo developer or small team since losing a self-managed keystore permanently locks you out of updating your app on the Play Store. If you want to manage your own keystore instead, run `eas credentials` and choose the manual option — only do this if you specifically need to reuse an existing keystore (e.g. migrating an already-published app).

---

## 11. Play Store Preparation

Before you can submit:

1. **Google Play Console account** — one-time $25 USD registration fee at [play.google.com/console](https://play.google.com/console).
2. **Create the app** in Play Console: **Create app** → fill in name, default language, app/game type, free/paid.
3. **Store listing assets** (see [STORE_ASSETS.md](STORE_ASSETS.md) for exact specs): feature graphic (1024×500), app icon (512×512, 32-bit PNG with alpha), 2–8 phone screenshots, short description (≤80 chars), full description (≤4000 chars).
4. **Content rating questionnaire** — answer Google's standard questionnaire in Play Console (Policy → App content).
5. **Data Safety form** — declare what data the app collects (this app collects email, and optionally microphone audio for chord detection/tuning — declare accordingly).
6. **Privacy policy URL** — must be publicly reachable; link it in Play Console → Policy → App content.
7. **Service account for automated submission (optional but recommended):**
   - Play Console → **Setup → API access** → link to (or create) a Google Cloud project.
   - In that Google Cloud project, create a service account with the **Release Manager** role.
   - Download its JSON key and save it as `mobile_app/google-play-key.json` (this path is already referenced by `eas.json`'s `submit.production.android.serviceAccountKeyPath` and is git-ignored — never commit it).

Submit the AAB you built in Section 10:
```bash
eas submit --platform android --profile production
```
This uploads directly to your chosen Play Console track (internal testing, closed testing, or production) using the service account key above. Alternatively, upload the `.aab` file manually through the Play Console web UI if you'd rather not set up the service account yet.

---

## 12. Testing

- **Internal testing track** (Play Console → Testing → Internal testing): the fastest way to get a build in front of real testers — no review wait, live within minutes of upload. Add testers by email.
- **Closed/open testing tracks**: for a wider beta; these do go through a lighter review than production.
- Always test the **preview APK** (Section 10) on at least one real device before submitting a production build — the emulator cannot verify microphone-dependent features (tuner, live chord detection) realistically.
- Test the full purchase flow in a Play Console **license testing** account (Play Console → Setup → License testing) before going live — this lets you complete real-looking purchases without being charged.

---

## 13. Common Errors & Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `SDK location not found` | `ANDROID_HOME` not set, or set in a shell EAS/Gradle doesn't inherit | Re-check Section 4; restart your terminal/IDE after setting the variable |
| Gradle build fails with a `Unsupported class file major version` or similar JVM error | Wrong JDK version active (JDK 21+ instead of 17) | Set `JAVA_HOME` to your JDK 17 install (Section 1/4); run `java -version` to confirm |
| `adb: no devices/emulators found` | Emulator not running, or phone's USB debugging not authorized | Boot the emulator from Device Manager, or re-check Section 6 steps 2–4 |
| Blank white screen on app start | Required font files missing from `mobile_app/assets/fonts/` | Download the fonts listed in `mobile_app/README.md` and place them there before building |
| `eas build` fails immediately with a credentials error | No Expo account linked, or `projectId` still the `TODO_` placeholder | Re-run `npx eas init` (Section 7) |
| EAS build succeeds but app crashes on launch on a real device (not the emulator) | Usually a native module misconfiguration surfaced only in release mode | Check the EAS build logs' "Run gradlew" step for warnings; try `eas build --profile preview --local` to reproduce on your own machine with fuller error output |
| `eas submit` fails with a permissions error | Service account missing the Release Manager role, or app not yet created in Play Console | Re-check Section 11 step 7; the app must exist in Play Console before the API can upload to it |
| Android emulator is extremely slow or won't boot | Hardware virtualization not enabled | Enable Intel VT-x/AMD-V in your BIOS/UEFI settings (Section 5) |
| `Metro: cannot resolve module` | Stale `node_modules` or Metro cache | `rm -rf node_modules && npm install && npx expo start --clear` |
| `reanimated: useSharedValue called before...` | `react-native-reanimated/plugin` not listed last in `babel.config.js` | Confirm plugin order in `mobile_app/babel.config.js` — Reanimated's plugin must always be the last entry |

---

## Related Documents

- [EAS.md](EAS.md) — EAS build profile reference and current blocker status
- [STORE_ASSETS.md](STORE_ASSETS.md) — exact screenshot/icon specs and ASO checklist
- [ENVIRONMENT.md](ENVIRONMENT.md) — every mobile environment variable explained
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — the full pre-launch operational checklist, mobile section
- `mobile_app/README.md` — day-to-day mobile developer quickstart
