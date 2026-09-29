# Wilsify AI — App Store Assets Checklist

## App Metadata (Both Stores)

- [ ] **App name**: Wilsify AI — Chord & BPM Detector
- [ ] **Short description** (80 chars): Real-time chord detection, AI music tutor & guitar tuner
- [ ] **Full description** (4000 chars max): See `assets/store/description.txt`
- [ ] **Keywords**: chord detector, BPM finder, guitar tuner, music theory, AI tutor, song analysis
- [ ] **Category**: Music
- [ ] **Support URL**: https://wilsify.ai/support
- [ ] **Privacy policy URL**: https://wilsify.ai/privacy
- [ ] **Marketing URL**: https://wilsify.ai

---

## iOS App Store (App Store Connect)

### Screenshots (required, all must be real device/simulator)

| Device | Size | Count |
|--------|------|-------|
| iPhone 6.7" (Pro Max) | 1290 × 2796 | 5–10 |
| iPhone 6.5" (Plus) | 1242 × 2688 | 5–10 |
| iPad 12.9" (optional) | 2048 × 2732 | 5–10 |

**Screenshot order & content:**
1. [ ] Home screen — song list with waveform cards
2. [ ] Analysis screen — chord diagram with BPM + key results
3. [ ] Live chord detection — real-time chord badge overlay
4. [ ] AI Tutor screen — chat conversation with chord context
5. [ ] Tuner screen — needle gauge, note name, cents indicator
6. [ ] Pricing screen — plan comparison

### App Preview Videos (optional but +40% conversion)
- [ ] 15–30s screen recording per device size
- [ ] No audio longer than 30s
- [ ] No external logos

### App Icon
- [ ] 1024 × 1024 px PNG (no alpha, no rounded corners — Apple rounds them)
- [ ] No text inside icon (Apple guideline)
- [ ] Dark version prepared for system dark mode

### Metadata
- [ ] Bundle ID: `ai.wilsify.app`
- [ ] SKU: `wilsify-ai-v1`
- [ ] Version: `1.0.0`, Build: auto from EAS
- [ ] Age rating: 4+ (no objectionable content)
- [ ] Localizations: English (primary), Hindi (optional)

### In-App Purchases (required before submission)
- [ ] `ai.wilsify.app.pro.monthly` — Pro Monthly ₹299
- [ ] `ai.wilsify.app.pro.annual` — Pro Annual ₹2,499
- [ ] `ai.wilsify.app.studio.monthly` — Studio Monthly ₹699
- [ ] `ai.wilsify.app.studio.annual` — Studio Annual ₹5,999
- [ ] Each IAP: display name, description, price confirmed

### Review Notes (put in App Review Information)
```text
Test account: reviewer@wilsify.ai / ReviewTest123!
The app requires an internet connection for analysis.
The free tier allows 5 uploads and chord detection with no payment required.
AI Tutor requires a Pro subscription. Use the test account which has Pro access.
```

### App Review Checklist
- [ ] Login / register works
- [ ] Audio upload + analysis completes end-to-end
- [ ] Tuner works with microphone permission
- [ ] Live chord detection works with microphone permission
- [ ] In-app purchase flow presents correctly (sandbox tested)
- [ ] Restore Purchases button works
- [ ] Privacy policy linked and accessible

---

## Google Play Store

### Screenshots
| Device | Size | Count |
|--------|------|-------|
| Phone | 1080 × 1920 (min) | 2–8 |
| 7" tablet (optional) | 1200 × 1920 | 2–8 |
| 10" tablet (optional) | 1920 × 1200 | 2–8 |

Same content order as iOS.

### Feature Graphic
- [ ] 1024 × 500 px JPG/PNG (shown at top of Play listing)

### App Icon
- [ ] 512 × 512 px PNG (32-bit with alpha)

### Metadata
- [ ] Package name: `ai.wilsify.app`
- [ ] Category: Music & Audio
- [ ] Content rating: Everyone
- [ ] Target SDK: 35 (Android 15)

### Google Play Billing
- [ ] Product IDs mirror iOS: `ai.wilsify.app.pro.monthly`, etc.
- [ ] Subscription base plan + offers configured

### Data Safety Form (required)
- [ ] Audio files collected: Yes (user-uploaded for analysis)
- [ ] Email address collected: Yes (account)
- [ ] Data encrypted in transit: Yes (TLS 1.3)
- [ ] Data deletion available: Yes (account deletion → support)
- [ ] Data shared with third parties: Yes — Anthropic/OpenAI for AI Tutor responses

---

## ASO (App Store Optimization)

### Title (30 chars max for App Store)
```text
Wilsify AI: Chord Detector
```

### Subtitle / Short description
```text
BPM, Key & AI Music Tutor
```

### Keyword Bank (100 chars, App Store)
```text
chord,bpm,tuner,guitar,music,key,scale,midi,tab,detect,song,analysis,piano,ukulele,bass
```

---

## Legal

- [ ] Privacy policy published at https://wilsify.ai/privacy
- [ ] Terms of service published at https://wilsify.ai/terms
- [ ] EULA linked (Apple requires explicit EULA if deviating from default)
- [ ] Subscription terms clearly state auto-renewal and cancellation
- [ ] GDPR / DPDP (India) compliance: user data deletion support email listed

---

## Pre-submission Final Checks

- [ ] `eas build` succeeds for both platforms with `production` profile
- [ ] No debug flags or console.log leaking PII in production build
- [ ] Crashlytics / Sentry DSN configured for production
- [ ] All IAPs sandbox-tested on real devices
- [ ] Push notifications tested on real devices
- [ ] Accessibility: minimum tap target 44 × 44 pt (verified)
- [ ] App works on iOS 16 / Android 10 (min supported)
- [ ] Dark mode only (the app uses a dark theme — confirm no white flashes)

---

## Related Documents

- [EAS.md](EAS.md) — build configuration these assets accompany
- [ANDROID_DEPLOYMENT_GUIDE.md](ANDROID_DEPLOYMENT_GUIDE.md) — Play Store submission walkthrough
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — where store submission fits in the launch sequence
- [../README.md](../README.md) — documentation map
