# Wilsify AI — EAS Build & Submit

**Date**: June 16, 2026  
**Phase**: 6 — Beta Blockers  
**Status**: BLOCKERS DOCUMENTED — manual values required before build

---

## Blockers Found & Fixed

### 1. `eas.json` — iOS Submit Placeholders

**Before**:
```json
"ios": { "appleId": "yourAppleId@example.com", "ascAppId": "YOUR_APP_ID" }
```

**After**:
```json
"ios": { "appleId": "TODO_your_apple_id@yourdomain.com", "ascAppId": "TODO_your_asc_app_id_from_app_store_connect" }
```

**Action Required**: Replace `TODO_` values before running `eas submit --platform ios`.

| Field | Where to find |
|-------|---------------|
| `appleId` | Apple ID used to log in to App Store Connect |
| `ascAppId` | App Store Connect → App → App Information → Apple ID (numeric, e.g. `1234567890`) |

---

### 2. `app.json` — EAS Project ID Placeholder

**Before**:
```json
"extra": { "eas": { "projectId": "your-eas-project-id" } }
```

**After**:
```json
"extra": { "eas": { "projectId": "TODO_your-eas-project-uuid-from-expo-dev" } }
```

**Action Required**:
1. Create an account at [expo.dev](https://expo.dev) if not already done
2. Run `npx eas init` in `mobile_app/` — this auto-populates the projectId
3. Or create a project manually in the Expo dashboard and copy the UUID

---

## Current `eas.json` Structure

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "aab" },
      "ios": { "credentialsSource": "remote" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "TODO_your_apple_id@yourdomain.com",
        "ascAppId": "TODO_your_asc_app_id_from_app_store_connect"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "production"
      }
    }
  }
}
```

---

## Bundle Identifiers — Verified

| Platform | Identifier |
|----------|------------|
| iOS (`bundleIdentifier`) | `ai.wilsify.app` |
| Android (`package`) | `ai.wilsify.app` |

Both are correct and consistent.

---

## Required EAS Environment Variables

Set these in the EAS dashboard under each build profile:

| Variable | Profile | Notes |
|----------|---------|-------|
| `EXPO_PUBLIC_API_URL` | production | e.g. `https://api.wilsify.ai` |
| `EXPO_PUBLIC_PROJECT_ID` | production | same as `extra.eas.projectId` |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | production | Razorpay live key (`rzp_live_...`) |
| `EXPO_PUBLIC_SENTRY_DSN` | production | Sentry DSN for mobile error tracking |

---

## Google Play Submit

The `serviceAccountKeyPath: "./google-play-key.json"` assumes a Google Play service account key file exists at `mobile_app/google-play-key.json`. This file is gitignored and must be placed manually before `eas submit --platform android`.

To create:
1. Google Play Console → Setup → API access
2. Link to Google Cloud project
3. Create service account with "Release Manager" role
4. Download JSON key → save as `mobile_app/google-play-key.json`

---

## Build Commands

```bash
cd mobile_app

# Development build (simulator)
eas build --platform ios --profile development

# Preview build (internal testing)
eas build --platform all --profile preview

# Production build
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios --profile production
eas submit --platform android --profile production

# OTA updates (JS changes only — no native rebuild needed)
eas update --branch production --message "description of change"
```

---

## Status

- [x] `eas.json` placeholder values updated with clear TODO markers
- [x] `app.json` projectId placeholder updated with clear TODO marker
- [x] Bundle identifiers verified (`ai.wilsify.app`)
- [x] `react-native-iap` plugin added to `app.json` plugins
- [ ] Real `appleId` filled in
- [ ] Real `ascAppId` filled in
- [ ] Real `projectId` from `eas init` filled in
- [ ] `google-play-key.json` placed in `mobile_app/`
- [ ] EAS env vars set in Expo dashboard

---

## Related Documents

- [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) — full beginner walkthrough of this build/submit flow
- [STORE_ASSETS.md](STORE_ASSETS.md) — screenshots and metadata needed alongside the build
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — where these steps fit in the overall launch sequence
- [../README.md](../README.md) — documentation map
