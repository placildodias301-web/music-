# Wilsify AI — Copyright & Data Policy

This page explains what Wilsify AI stores when you use it, for how long,
and how to request removal of anything you've uploaded.

## What we store

| Data | Stored? | For how long |
|---|---|---|
| The original audio/video file you upload | **No.** It is decoded in memory/temp storage for analysis and deleted immediately after processing (`services/audio_extract.py`'s `cleanup()` step). | Seconds — deleted as soon as analysis completes, success or failure. |
| Detected analysis results (key, tempo, chords, difficulty) | Only in your browser session (`MvpContext`), not on our servers. | Until you close/reload the tab. |
| Rights attestation record (see below) | Yes — filename + timestamp only, no audio content. | Indefinitely, as an audit record. |
| Practice session history (Practice Mode analytics) | Yes, but only in **your own browser's local storage** — never sent to or stored on our servers. | Until you clear your browser data. |

## Rights attestation

Before analyzing any file, you must confirm: *"I confirm I own this audio
or have the right to use it for personal practice."* This isn't just UI
text — checking it logs a real, timestamped record (filename + UTC
timestamp) via `POST /api/rights-attestation`, appended to a server-side
log file. No audio content is included in this record — only the
confirmation that it was made, and when.

## No public sharing

Wilsify AI does not have, and will not build, any public gallery or
endpoint that lists songs other users have analyzed. Every analysis result
lives only in the browser session that produced it.

## Takedown requests

If you believe content processed through this demo infringes your rights,
contact: **[your email/contact here]**. Since original audio is deleted
immediately after analysis and not persisted, there is typically nothing
to take down beyond the attestation log entry, which can be removed on
request.

---
*This is a college MVP demo, not a commercial product. This policy
reflects the actual, current behavior of the code in this repository.*
