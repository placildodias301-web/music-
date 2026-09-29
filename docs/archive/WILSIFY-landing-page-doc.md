# Wilsify AI — Landing Page Documentation

**AI-Powered Music Analysis Platform**
Static Landing Page • HTML • CSS • Vanilla JavaScript • No Build Tools

---

## Overview

Wilsify AI is a SaaS music analysis platform that helps musicians instantly understand any song.

Users can upload audio files or play live through a microphone and receive advanced AI-powered music analysis, including:

### Core Features

- Chord Detection
- BPM Detection
- Musical Key Analysis
- Camelot Notation
- Guitar Tabs Generation
- Sheet Music PDF Export
- MIDI Export
- Stem Separation
  - Vocals
  - Drums
  - Bass
  - Other Instruments
- Real-Time Live Chord Detection (<150ms latency)
- Professional Chromatic Tuner
- AI Music Tutor
- Community Feed
- Practice Streak System
- XP & Progress Tracking

---

## Project Structure

```text
wilsify-web-v1.1/
│
├── index.html     # Main landing page
├── style.css      # All styles
├── script.js      # Dynamic content and interactions
└── WILSIFY.md     # Documentation
```

### Technology Stack

| Technology         | Usage         |
|---------------------|---------------|
| HTML5              | Structure     |
| CSS3               | Styling       |
| Vanilla JavaScript | Interactivity |
| Google Fonts       | Typography    |

### Fonts

- Space Grotesk (Headings)
- Inter (Body Text)

### Color Palette

| Element      | Color     |
|--------------|-----------|
| Background   | `#0B1020` |
| Primary Text | `#F8FAFC` |
| Muted Text   | `#94A3B8` |
| Brand Purple | `#7C5CFF` |
| Dark Purple  | `#5B3FD9` |
| Cyan         | `#00D4FF` |
| Pink         | `#FF6B9D` |

---

## Quick Start

No installation required.

Simply open:

```text
index.html
```

in any modern browser.

All landing page components work out of the box:

- Hero animations
- Counters
- Modals
- Pricing toggle
- Community feed
- Feature cards
- Roadmap
- Interactive tuner demo

---

## Landing Page Structure

### Modal Components

Placed before navigation in the DOM.

#### Sign In Modal

`#signinModal`

Features:

- Google OAuth
- Email Login
- Password Login
- Forgot Password

#### Sign Up Modal

`#signupModal`

Features:

- Google OAuth
- First Name
- Last Name
- Email
- Password

Benefits shown:

> No Credit Card Required
> 50 Credits Daily

---

## Navigation Bar

`#navbar`

Fixed navigation with frosted glass effect on scroll.

### Navigation Links

1. Download
2. Features
3. Tuner
4. Community
5. Pricing
6. Roadmap

Actions:

- Sign In
- Get Started Free

### Mobile Navigation

Same links appear in:

```html
.mobile-menu
```

---

## Sections

### 1. Hero Section

`section.hero`

#### Components

##### Badge

```text
AI-powered music analysis · Now live
```

##### Headline

```text
AI that hears your [rotating word] instantly.
```

Rotating words:

- Chords
- BPM
- Tabs
- MIDI
- Stems

##### Description

Upload any song and instantly receive:

- Chords
- BPM
- Tabs
- MIDI
- Sheet Music
- Stem Separation

##### CTA Buttons

- Start Free — No Card Needed
- See How It Works

##### Social Proof

- 5 Avatar Emojis
- 4,800+ Musicians
- ★★★★★ 4.9/5 Rating

##### Visual Elements

- Animated Orbs
- Grid Background
- Waveform Animation

---

### 2. Statistics Section

`section.stats`

Animated counters:

| Metric          | Value      |
|------------------|------------|
| Musicians       | 4,800+     |
| Songs Analyzed  | 28,000+    |
| Chords Detected | 2,100,000+ |
| Countries       | 142        |

---

### 3. How It Works

`#how-it-works`

Two-column layout.

#### Left Side

##### Pill

```text
See it in action
```

##### Features

1. Upload a song
2. AI analyzes the audio
3. Receive tabs, MIDI, chords and more

##### Download Buttons

###### App Store

```html
href="javascript:void(0)"
```

###### Google Play

```html
href="javascript:void(0)"
```

#### Right Side

Phone mockup containing:

```html
#hiw-yt-iframe
```

YouTube video embedded inside device frame.

##### Required Update

Replace:

```text
YOUTUBE_VIDEO_ID
```

with your actual YouTube video ID.

---

### 4. Features Section

`#features`

#### Heading

```text
One platform. Every music tool.
```

Feature cards are dynamically generated via:

```javascript
#featuresGrid
```

---

### 5. Professional Tuner

`#tuner`

#### Features

- FFT-based detection
- Real-time tuning
- Multiple instrument tunings
- Precision note tracking

#### Components

- Tuning Presets
- Note Display
- Frequency Bars
- SVG Needle
- Start Button

Main Trigger:

```javascript
toggleTuner()
```

#### Tuner Access by Plan

| Tuning            | FREE | PRO | STUDIO |
|-------------------|:----:|:---:|:------:|
| Standard (EADGBE) | ✓    | ✓   | ✓      |
| Ukulele           | ✓    | ✓   | ✓      |
| Violin            | ✓    | ✓   | ✓      |
| Drop D            | ✗    | ✓   | ✓      |
| Open G            | ✗    | ✓   | ✓      |
| DADGAD            | ✗    | ✓   | ✓      |
| Half-Step Down    | ✗    | ✓   | ✓      |
| Bass Standard     | ✗    | ✓   | ✓      |

---

### 6. Community Section

`#community`

#### Heading

```text
Musicians love Wilsify AI.
```

Posts generated dynamically:

```javascript
#postsGrid
```

---

### 7. Credit System

<!-- FIXME: This landing page describes a "50 credits every 24 hours" daily-reset model,
     matching what web/index.html currently displays. The actual backend
     (backend/src/config/plans.ts PLAN_CREDITS, docs/architecture/DATABASE.md "Credit
     System") allocates credits monthly per plan (FREE=50/mo, PRO=2500/mo, etc.), not
     daily. One of the two is wrong for the shipped product — reconcile before this
     copy misleads users about what they're paying for. Not fixed here because it is a
     product/marketing decision (which model is correct), not a documentation typo. -->

Dynamic credit table:

```javascript
#creditsTable
```

#### Free Plan Credits

Every user receives:

```text
50 credits every 24 hours
```

Credits reset automatically regardless of usage.

#### Credit Costs by Operation

| Operation          | Credits | Minimum Plan |
|---------------------|---------|--------------|
| Chord Detection    | 1       | FREE         |
| BPM + Key Analysis | 1       | FREE         |
| AI Tutor Message   | 1       | PRO          |
| MIDI Export        | 2       | PRO          |
| Pitch Tracking     | 2       | PRO          |
| Live Detection     | 2/min   | PRO          |
| Sheet Music PDF    | 4       | PRO          |
| Stem Separation    | 5       | STUDIO       |

---

### 8. Pricing

`#pricing`

#### Billing Modes

- Monthly
- Annual

Annual plans include:

```text
25% Discount
```

Controlled through:

```javascript
setBilling()
```

Pricing cards generated inside:

```javascript
#plansGrid
```

#### Plan Pricing

| Plan       | Monthly | Annual    | Credits   |
|------------|---------|-----------|-----------|
| FREE       | ₹0      | —         | 50/day    |
| PRO        | ₹299/mo | ₹2,499/yr | 2,500/mo  |
| STUDIO     | ₹699/mo | ₹7,200/yr | 5,000/mo  |
| ENTERPRISE | Custom  | Custom    | Unlimited |

#### Introductory Offer

**7-Day Pro Trial — ₹1**

Conditions:

- First-time subscribers only
- Automatically renews at ₹299/month

---

### 9. Product Roadmap

`#roadmap`

Displays:

- Released Features
- Upcoming Features
- Planned Enhancements

Generated dynamically through:

```javascript
#roadmapGrid
```

---

### 10. Final CTA

#### Heading

```text
Ready to understand every song?
```

Buttons:

- Start Free Now
- See Pricing

#### Fine Print

- No credit card required
- 50 credits daily
- Credits reset every 24 hours
- Cancel anytime

---

## Footer

### Column 1 — Brand

- Logo
- Tagline
- Social Links

### Column 2 — Product

Product navigation links.

### Column 3 — Platform

Platform resources.

### Column 4 — Company

Company information.

### Bottom Bar

```text
© 2026 Wilsify AI
```

Status Indicator:

🟢 All Systems Operational

---

## Pending Tasks

| Task                     | Location     |
|---------------------------|--------------|
| Replace YouTube Video ID | `index.html` |
| Add App Store URL        | `index.html` |
| Add Google Play URL      | `index.html` |
| Add Social Media Links   | Footer       |

---

## License

© 2026 Wilsify AI

All rights reserved.
