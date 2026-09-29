"""
Wilsify AI Assistant — rule-based demo implementation.

No external AI API is configured. This is a genuine, working rule-based
Q&A engine over a fixed set of music-theory topics — it is NOT a large
language model, and callers must not present it as one.

Section 4.4 of the spec calls for a "Contextual AI tutor" that answers
using the real detected song data (chords, key, tempo, weak chords) rather
than being a generic disconnected chatbot. `answer_question` therefore
accepts an optional `context` dict (the currently-viewed song's key, bpm,
time signature, chord progression, difficulty, and the user's logged weak
chords) and checks song-grounded questions FIRST, before falling back to
the generic music-theory rules below. This keeps the "no LLM API key
needed" zero-budget property while still being genuinely grounded, not a
disconnected chatbot.

To connect a real AI API later: keep `answer_question(question, context)`'s
signature the same, call the real API inside it (passing `context` as part
of the system prompt) instead of matching rules, and set `is_demo` to
False. Keep any API key server-side (environment variable), never in the
frontend.
"""

import re


def _grounded_answer(question: str, context: dict | None) -> dict | None:
    """
    Answers questions about the currently-loaded song using real detected
    data, when a context is provided. Returns None (falls through to the
    generic rules) if the question isn't about "this song" or no context
    was sent.
    """
    if not context:
        return None

    q = question.lower()
    chords = context.get("chordProgression") or []
    key = context.get("key")
    bpm = context.get("bpm")
    time_signature = context.get("timeSignature")
    difficulty = context.get("difficultyLabel")
    weak_chords = context.get("weakChords") or []
    file_name = context.get("fileName")

    references_song = any(
        phrase in q for phrase in ("this song", "the song", "this track", "current song", "it ")
    ) or q.strip().endswith(" it")

    if ("key" in q and ("this song" in q or "song" in q or "track" in q)) or (
        "what key" in q and references_song
    ):
        if key:
            return {
                "answer": f"{file_name or 'This song'} is in the key of {key}.",
                "isDemo": True,
                "matchedTopic": "grounded-key",
            }

    if "chord" in q and ("this song" in q or "song" in q or "track" in q or "used" in q or "are in" in q):
        if chords:
            unique_in_order = list(dict.fromkeys(chords))
            return {
                "answer": f"The detected chord progression for {file_name or 'this song'} is: {' → '.join(unique_in_order)}.",
                "isDemo": True,
                "matchedTopic": "grounded-chords",
            }

    if ("tempo" in q or "bpm" in q or "fast" in q or "slow" in q) and (
        "this song" in q or "song" in q or "track" in q
    ):
        if bpm:
            feel = "fast" if bpm >= 130 else "moderate" if bpm >= 90 else "slow/relaxed"
            return {
                "answer": f"{file_name or 'This song'} is {bpm} BPM ({time_signature or '4/4'} time) — that's a {feel} tempo.",
                "isDemo": True,
                "matchedTopic": "grounded-tempo",
            }

    if "difficult" in q or "hard" in q or "easy" in q:
        if difficulty:
            return {
                "answer": f"Wilsify AI rates {file_name or 'this song'} as {difficulty} difficulty, based on its chord complexity, chord-change rate, and tempo.",
                "isDemo": True,
                "matchedTopic": "grounded-difficulty",
            }

    if "weak" in q or "struggl" in q or "practice" in q and "what" in q:
        if weak_chords:
            return {
                "answer": f"Based on your practice history, you've been slow or inaccurate on: {', '.join(weak_chords)}. Try looping just the section(s) with those chords at a slower tempo.",
                "isDemo": True,
                "matchedTopic": "grounded-weak-chords",
            }

    return None

RULES = [
    ("c-major-chord", re.compile(r"\bc\s*major\s*chord\b|\bwhat.*c\s*major\b", re.I),
     "A C Major chord is made of three notes: C, E, and G. It's a triad built from the 1st, 3rd, and 5th notes of the C Major scale. On a piano, play C-E-G together with your right hand. On guitar, it's one of the first open chords most people learn."),
    ("g-major-chord", re.compile(r"\bg\s*major\b", re.I),
     "G Major is built from the notes G, B, and D. On guitar, a common open-position G chord uses your fingers on the low E (3rd fret), A (2nd fret), and high E (3rd fret) strings, with the D, G, and B strings open. On piano, play G-B-D together."),
    ("a-minor-chord", re.compile(r"\ba\s*minor\s*chord\b|\bwhat.*am\b", re.I),
     "A Minor (Am) is made of the notes A, C, and E. It's the relative minor of C Major, meaning it shares the same key signature (no sharps or flats) but has a sadder, more melancholic sound because it's built from a different starting note."),
    ("f-major-chord", re.compile(r"\bf\s*major\s*chord\b", re.I),
     "F Major is made of the notes F, A, and C. It's often one of the trickier early chords on guitar because it typically requires a partial barre, but on piano it's just three notes played together."),
    ("bpm", re.compile(r"\bwhat\s*is\s*bpm\b|\bbpm\b.*mean|\btempo\b.*mean", re.I),
     "BPM stands for Beats Per Minute — it measures tempo, or how fast a song feels. A ballad might sit around 60-80 BPM, pop songs are often 100-130 BPM, and fast dance or punk tracks can go well above 140 BPM. A metronome is the classic tool for practicing at a fixed BPM."),
    ("cgamf-progression", re.compile(r"c\s*-?\s*g\s*-?\s*am\s*-?\s*f|c\s*g\s*am\s*f|1\s*5\s*6\s*4|explain.*progression", re.I),
     "The C-G-Am-F progression (also called the 'I-V-vi-IV' progression) is one of the most popular chord progressions in modern music — it's the backbone of hundreds of pop songs. It works because it moves between the tonic (C, home base), the dominant (G, tension), the relative minor (Am, an emotional shift), and the subdominant (F, a gentle pull back home) — giving a satisfying, singable loop."),
    ("major-scale", re.compile(r"\bmajor\s*scale\b", re.I),
     "A major scale is a sequence of 8 notes following the pattern Whole-Whole-Half-Whole-Whole-Whole-Half (W-W-H-W-W-W-H). For example, the C Major scale is C-D-E-F-G-A-B-C, using only the white keys on a piano. It's the foundation most Western music theory is built on."),
    ("minor-scale", re.compile(r"\bminor\s*scale\b", re.I),
     "The natural minor scale follows the pattern Whole-Half-Whole-Whole-Half-Whole-Whole. For example, A Natural Minor is A-B-C-D-E-F-G-A, using the same notes as C Major but starting from A — which is why A Minor is called the 'relative minor' of C Major."),
    ("time-signature", re.compile(r"\btime\s*signature\b", re.I),
     "A time signature (like 4/4 or 3/4) tells you how many beats are in each measure, and what note value counts as one beat. 4/4 ('common time') means 4 quarter-note beats per measure and is the most common in pop, rock, and hip-hop. 3/4 gives a waltz-like feel, and 6/8 is common in ballads and some rock songs."),
    ("key-signature", re.compile(r"\bkey\s*signature\b|\bwhat.*(a )?key\b", re.I),
     "A key signature tells you which sharps or flats are used throughout a piece, and identifies its tonal center (e.g. 'C Major' or 'A Minor'). Knowing a song's key helps you pick chords and scales that will sound harmonically 'in tune' with the rest of the piece."),
    ("metronome", re.compile(r"\bmetronome\b", re.I),
     "A metronome produces a steady, repeating click at a set BPM to help you keep consistent timing while practicing. Try practicing a difficult passage slower than the target tempo first, then gradually increase the BPM once you can play it cleanly."),
    ("practice-tips", re.compile(r"\bhow.*practice\b|\btips?\b.*practice|\bimprove\b", re.I),
     "A few solid practice habits: (1) slow down difficult sections and build up speed gradually, (2) use a metronome or loop tool to lock in timing, (3) practice in short, focused sessions rather than one long one, and (4) isolate the hardest 2-4 bars and repeat them before playing the whole piece."),
]

FALLBACK_ANSWER = (
    "I'm a rule-based demo assistant for this MVP, so I can only answer a "
    "focused set of music-theory questions right now — things like chord "
    "names (C Major, G Major, Am, F), BPM, time signatures, scales, or the "
    "C-G-Am-F progression. Try asking one of those!"
)


def answer_question(question: str, context: dict | None = None) -> dict:
    q = (question or "").strip()

    if not q:
        return {
            "answer": "Ask me something about chords, scales, BPM, or music theory!",
            "isDemo": True,
            "matchedTopic": None,
        }

    grounded = _grounded_answer(q, context)
    if grounded is not None:
        return grounded

    for topic_id, pattern, answer in RULES:
        if pattern.search(q):
            return {"answer": answer, "isDemo": True, "matchedTopic": topic_id}

    return {"answer": FALLBACK_ANSWER, "isDemo": True, "matchedTopic": None}
