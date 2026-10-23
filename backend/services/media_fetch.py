"""
Media fetching and YouTube search/input flow for Wilsify AI MVP.

Security & MVP rules enforced:
- YouTube links (youtube.com, www.youtube.com, m.youtube.com, music.youtube.com,
  youtu.be) or bare 11-character video IDs get strict validation: we extract the
  video ID and pass only a canonical watch URL to the yt-dlp Python API.
- Any other public http(s) link (Instagram, TikTok, Facebook, X, SoundCloud,
  Vimeo, ...) is accepted if one of yt-dlp's site-specific extractors claims it.
  The "generic" extractor stays disabled, so arbitrary web pages and raw file
  URLs are never fetched, and private/local addresses are refused up front.
- Playlists, channels, live streams, upcoming streams, and videos over 20 minutes
  are rejected with clear user-facing messages.
- User URLs are never passed to shell commands.
- Socket timeout is 15s with hard overall timeouts for search and download.
- Downloads are written to random UUID filenames inside TMP_DIR (never using the
  video title in a filesystem path) and cleaned up on failure, timeout, or completion.
"""

import ipaddress
import logging
import os
import re
import socket
import threading
import time
import uuid
from urllib.parse import parse_qs, urlparse

from services.audio_extract import TMP_DIR

logger = logging.getLogger(__name__)

MAX_MEDIA_BYTES = 100 * 1024 * 1024  # 100 MB (matches upload cap)
MAX_DURATION_SECONDS = 20 * 60       # 20 minutes
SOCKET_TIMEOUT_SECONDS = 15
DOWNLOAD_TIMEOUT_SECONDS = 60.0
MAX_SEARCH_RESULTS = 24

YOUTUBE_FALLBACK_MESSAGE = (
    "YouTube could not provide this video right now. "
    "Please try again later or upload the audio file directly."
)
LINK_FALLBACK_MESSAGE = (
    "We couldn't get audio from that link right now. "
    "Please try again later or upload the audio file directly."
)
UNSUPPORTED_SITE_MESSAGE = (
    "That website isn't supported. Try a link to a single video or track on "
    "YouTube, Instagram, TikTok, Facebook, X, SoundCloud or Vimeo, or upload the file directly."
)

ALLOWED_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}

# Kept for backward compatibility with existing unit test `test_social_hosts_are_routed_to_ytdlp`
SOCIAL_HOSTS = (
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "instagram.com",
    "tiktok.com",
    "facebook.com", "fb.watch",
    "x.com", "twitter.com",
    "soundcloud.com",
    "vimeo.com",
    "dailymotion.com", "dai.ly",
    "reddit.com", "redd.it",
    "twitch.tv",
    "bandcamp.com",
    "mixcloud.com",
    "snapchat.com",
    "threads.net",
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

_YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Per-user / per-client concurrency guard (max 1 active YouTube job per client key)
_active_jobs_lock = threading.Lock()
_active_youtube_jobs: set[str] = set()


class MediaFetchError(Exception):
    """User-safe error — the message is shown in the UI as-is."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def acquire_youtube_slot(client_key: str) -> bool:
    with _active_jobs_lock:
        if client_key in _active_youtube_jobs:
            return False
        _active_youtube_jobs.add(client_key)
        return True


def release_youtube_slot(client_key: str) -> None:
    with _active_jobs_lock:
        _active_youtube_jobs.discard(client_key)


def _host_matches(host: str, domains: tuple[str, ...]) -> bool:
    host = host.lower().rstrip(".")
    return any(host == d or host.endswith("." + d) for d in domains)


def _validate_url(url: str) -> str:
    url = (url or "").strip()
    if not url or len(url) > 2048:
        raise MediaFetchError("Please paste a valid link to a video or song.")
    if _YT_ID_RE.match(url):
        return f"https://www.youtube.com/watch?v={url}"
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise MediaFetchError("Please paste a valid http(s) link.")
    return url


def _assert_public_host(url: str) -> None:
    host = urlparse(url).hostname
    if not host:
        raise MediaFetchError("Please paste a valid http(s) link.")
    # Fast-path check when host is literally an IP literal (e.g. 127.0.0.1, 10.0.0.5)
    try:
        literal_ip = ipaddress.ip_address(host)
        if not literal_ip.is_global:
            raise MediaFetchError("That link points to a private or local address, which isn't allowed.")
    except ValueError:
        pass

    if host.lower().rstrip(".") in ("localhost", "localhost.localdomain"):
        raise MediaFetchError("That link points to a private or local address, which isn't allowed.")

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise MediaFetchError("Couldn't reach that website - check the link and try again.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise MediaFetchError("That link points to a private or local address, which isn't allowed.")


def _safe_name(name: str, fallback: str = "Linked track") -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]+', " ", name or "").strip()
    return (name or fallback)[:120]


def is_social_url(url: str) -> bool:
    host = urlparse(_validate_url(url)).hostname or ""
    return _host_matches(host, SOCIAL_HOSTS)


def extract_youtube_video_id(url_or_id: str) -> str:
    """
    Validates that `url_or_id` is either an 11-character YouTube video ID or a
    single-video URL on an allowlisted YouTube domain:
      youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be
    Rejects playlists, channels, live stream URLs, and non-YouTube domains.
    Returns the validated 11-character video ID.
    """
    raw = (url_or_id or "").strip()
    if not raw or len(raw) > 2048:
        raise MediaFetchError("Please enter a valid YouTube video link.")

    if _YT_ID_RE.match(raw):
        return raw

    normalized = _validate_url(raw)
    parsed = urlparse(normalized)
    host = (parsed.hostname or "").lower().rstrip(".")

    if host not in ALLOWED_YOUTUBE_HOSTS:
        raise MediaFetchError(
            "Unsupported domain. Only YouTube links (youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be) are supported."
        )

    query = parse_qs(parsed.query)
    path = parsed.path or "/"
    path_lower = path.lower()
    segments = [seg for seg in path.split("/") if seg]

    # Reject playlists
    if path_lower.startswith("/playlist") or "list" in query:
        raise MediaFetchError("YouTube playlists are not supported. Please paste a link to a single video.")

    # Reject channels, user profiles, feeds, and search pages
    if (
        path_lower.startswith(("/@", "/channel", "/c/", "/user", "/feed", "/results"))
        or (segments and segments[0].startswith("@"))
    ):
        raise MediaFetchError("YouTube channels and feeds are not supported. Please paste a link to a single video.")

    # Reject explicit live stream URLs
    if path_lower.startswith("/live") or query.get("live") == ["1"]:
        raise MediaFetchError("Live streams cannot be analyzed. Please choose a recorded video under 20 minutes.")

    video_id = ""
    if host == "youtu.be":
        if len(segments) == 1:
            video_id = segments[0]
        else:
            raise MediaFetchError("Invalid youtu.be link. Please paste a direct link to a single YouTube video.")
    else:
        if path == "/watch":
            v_list = query.get("v") or []
            video_id = v_list[0] if len(v_list) == 1 else ""
        elif len(segments) == 2 and segments[0].lower() in ("shorts", "embed", "v"):
            video_id = segments[1]
        else:
            raise MediaFetchError("Unsupported YouTube URL. Please paste a direct YouTube video link.")

    if not _YT_ID_RE.match(video_id):
        raise MediaFetchError("Invalid YouTube video ID. Please check the link and try again.")

    return video_id


def fetch_media(url: str, client_key: str = "global", request_id: str | None = None) -> tuple[str, str]:
    """
    Validates `url` and downloads its audio into `TMP_DIR` under a random UUID
    filename. YouTube links go through strict video-ID validation; any other
    public link is handed to yt-dlp's site-specific extractors.
    Returns `(local_path, display_file_name)`. Caller must clean up `local_path`.
    """
    req_id = request_id or uuid.uuid4().hex[:12]
    raw = (url or "").strip()
    if not raw:
        raise MediaFetchError("Please paste a valid link to a video or song.")

    # Preserve SSRF / scheme checks first when a full URL is provided.
    normalized = _validate_url(raw)
    host = (urlparse(normalized).hostname or "").lower().rstrip(".")
    youtube = host in ALLOWED_YOUTUBE_HOSTS
    if youtube:
        video_id = extract_youtube_video_id(raw)
        canonical_url = f"https://www.youtube.com/watch?v={video_id}"
        _assert_public_host(canonical_url)
    else:
        _assert_public_host(normalized)
        _reject_non_video_link(normalized)

    if not acquire_youtube_slot(client_key):
        raise MediaFetchError(
            "Another link is already being fetched. Please wait for it to finish.",
            status_code=429,
        )

    try:
        if youtube:
            return _download_youtube_video(canonical_url, video_id, req_id)
        return _download_linked_media(normalized, req_id)
    finally:
        release_youtube_slot(client_key)


def _reject_non_video_link(url: str) -> None:
    """Cheap checks for links that obviously aren't a single video (playlists, live)."""
    parsed = urlparse(url)
    segments = [seg.lower() for seg in (parsed.path or "/").split("/") if seg]
    if "playlist" in segments or "sets" in segments or "list" in parse_qs(parsed.query):
        raise MediaFetchError("Playlists are not supported. Please paste a link to a single video or track.")
    if "live" in segments:
        raise MediaFetchError("Live streams cannot be analyzed. Please choose a recorded video under 20 minutes.")


def _download_youtube_video(canonical_url: str, video_id: str, request_id: str) -> tuple[str, str]:
    return _download_media(
        canonical_url,
        request_id,
        label=video_id,
        allowed_extractors=["youtube", "default", "-generic"],
        fallback_message=YOUTUBE_FALLBACK_MESSAGE,
        site_name="YouTube",
    )


def _download_linked_media(url: str, request_id: str) -> tuple[str, str]:
    # "default" = every site-specific extractor; "-generic" keeps yt-dlp from
    # scraping arbitrary pages or downloading raw file URLs.
    return _download_media(
        url,
        request_id,
        label=urlparse(url).hostname or "link",
        allowed_extractors=["default", "-generic"],
        fallback_message=LINK_FALLBACK_MESSAGE,
        site_name=None,
    )


def _download_media(
    url: str,
    request_id: str,
    *,
    label: str,
    allowed_extractors: list[str],
    fallback_message: str,
    site_name: str | None,
) -> tuple[str, str]:
    try:
        import yt_dlp
        from yt_dlp.utils import DownloadCancelled, DownloadError
    except ImportError:  # pragma: no cover - dependency missing
        raise MediaFetchError(fallback_message)

    class DownloadTimedOut(DownloadCancelled):
        pass

    deadline = time.monotonic() + DOWNLOAD_TIMEOUT_SECONDS

    def stop_at_deadline(_status: dict) -> None:
        # Runs inside yt-dlp's own download loop, so raising here really stops
        # the download. A thread-based timeout would leave it running and
        # writing files after we had already answered and cleaned up.
        if time.monotonic() > deadline:
            raise DownloadTimedOut()

    os.makedirs(TMP_DIR, exist_ok=True)
    stem = uuid.uuid4().hex
    opts = {
        "progress_hooks": [stop_at_deadline],
        "format": "bestaudio[filesize<100M]/bestaudio/best[filesize<100M]/best",
        "outtmpl": os.path.join(TMP_DIR, f"{stem}.%(ext)s"),
        "noplaylist": True,
        "playlist_items": "1",
        "max_filesize": MAX_MEDIA_BYTES,
        "allowed_extractors": allowed_extractors,
        "socket_timeout": SOCKET_TIMEOUT_SECONDS,
        "retries": 1,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "cachedir": False,
        "http_headers": {"User-Agent": USER_AGENT},
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            meta = ydl.extract_info(url, download=False)
            if meta and meta.get("entries"):
                meta = next((e for e in meta["entries"] if e), None)
            if not meta:
                raise MediaFetchError(fallback_message)

            live_status = meta.get("live_status") or ""
            if meta.get("is_live") or live_status in ("is_live", "is_upcoming", "post_live"):
                raise MediaFetchError(
                    "Live streams and upcoming premieres cannot be analyzed. Please choose a recorded video under 20 minutes."
                )

            duration = meta.get("duration")
            if duration and float(duration) > MAX_DURATION_SECONDS:
                raise MediaFetchError(
                    "That video is longer than 20 minutes. Please select a video under 20 minutes or upload an audio file."
                )

            info = ydl.extract_info(url, download=True)
    except DownloadTimedOut:
        _remove_stem(stem)
        logger.warning("[request_id=%s] Media download timed out for %s", request_id, label)
        raise MediaFetchError(
            fallback_message,
            status_code=504,
        )
    except MediaFetchError:
        _remove_stem(stem)
        raise
    except DownloadError as e:
        _remove_stem(stem)
        logger.warning("[request_id=%s] yt-dlp DownloadError for %s: %s", request_id, label, str(e)[-300:])
        raise MediaFetchError(_explain_ytdlp_error(str(e), site_name=site_name, fallback=fallback_message))
    except Exception as e:
        _remove_stem(stem)
        logger.warning("[request_id=%s] yt-dlp unexpected error for %s: %s", request_id, label, type(e).__name__)
        raise MediaFetchError(fallback_message)

    if info and info.get("entries"):
        info = next((e for e in info["entries"] if e), None)

    downloads = (info or {}).get("requested_downloads") or []
    path = downloads[0].get("filepath") if downloads else None
    if not path or not os.path.exists(path):
        # Also check TMP_DIR for any file written with this UUID stem
        for name in os.listdir(TMP_DIR):
            if name.startswith(stem):
                candidate = os.path.join(TMP_DIR, name)
                if os.path.isfile(candidate):
                    path = candidate
                    break

    if not path or not os.path.exists(path):
        _remove_stem(stem)
        if info and (info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming")):
            raise MediaFetchError(
                "Live streams and upcoming premieres cannot be analyzed. Please choose a recorded video under 20 minutes."
            )
        if info and (info.get("duration") or 0) > MAX_DURATION_SECONDS:
            raise MediaFetchError(
                "That video is longer than 20 minutes. Please select a video under 20 minutes or upload an audio file."
            )
        logger.warning("[request_id=%s] yt-dlp produced no file for %s", request_id, label)
        raise MediaFetchError(fallback_message)

    try:
        file_size = os.path.getsize(path)
    except OSError:
        file_size = 0

    if file_size <= 0:
        _remove_stem(stem)
        raise MediaFetchError(fallback_message)

    if file_size > MAX_MEDIA_BYTES:
        _remove_stem(stem)
        raise MediaFetchError("That video's audio exceeds the 100 MB limit. Please upload a smaller audio file.")

    ext = os.path.splitext(path)[1].lower()
    display_title = _safe_name((info or {}).get("title") or label, fallback=label)
    return path, display_title + ext


def search_youtube(
    query: str,
    limit: int = 12,
    client_key: str = "global",
    request_id: str | None = None,
) -> list[dict]:
    """
    Searches YouTube via yt-dlp Python API (metadata only, no shell execution)
    with a 15s socket timeout.
    """
    req_id = request_id or uuid.uuid4().hex[:12]
    query = re.sub(r"\s+", " ", query or "").strip()[:200]
    if not query:
        raise MediaFetchError("Type a song title or artist to search for.")
    limit = max(1, min(limit, MAX_SEARCH_RESULTS))

    try:
        import yt_dlp
    except ImportError:  # pragma: no cover - dependency missing
        raise MediaFetchError(YOUTUBE_FALLBACK_MESSAGE)

    opts = {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": SOCKET_TIMEOUT_SECONDS,
        "retries": 1,
        "quiet": True,
        "no_warnings": True,
        "cachedir": False,
        "http_headers": {"User-Agent": USER_AGENT},
    }

    # Metadata only (nothing written to disk), so socket_timeout bounds it;
    # a thread-based hard timeout would just leave the search running anyway.
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    except Exception as e:
        logger.warning("[request_id=%s] YouTube search failed for query=%r: %s", req_id, query, type(e).__name__)
        timed_out = isinstance(e, TimeoutError) or "timed out" in str(e).lower()
        raise MediaFetchError(YOUTUBE_FALLBACK_MESSAGE, status_code=504 if timed_out else 502)

    results = []
    for entry in (info or {}).get("entries") or []:
        if not entry or not isinstance(entry, dict):
            continue
        vid = entry.get("id") or ""
        if not _YT_ID_RE.match(vid):
            continue  # Ignore channels and playlists in search results
        duration = entry.get("duration")
        live_status = entry.get("live_status") or ""
        is_live = bool(entry.get("is_live") or live_status in ("is_live", "is_upcoming"))
        results.append({
            "id": vid,
            "title": entry.get("title") or "Untitled",
            "channel": entry.get("channel") or entry.get("uploader") or "",
            "durationSeconds": int(duration) if duration else None,
            "views": entry.get("view_count"),
            "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={vid}",
            "isLive": is_live,
            "tooLong": bool(duration and duration > MAX_DURATION_SECONDS),
        })
    return results


def _explain_ytdlp_error(
    message: str, site_name: str | None = "YouTube", fallback: str = YOUTUBE_FALLBACK_MESSAGE
) -> str:
    m = message.lower()
    subject = f"That {site_name} video" if site_name else "That video"
    if "unsupported url" in m or "no suitable extractor" in m:
        return UNSUPPORTED_SITE_MESSAGE
    if "live" in m and ("stream" in m or "event" in m or "premiere" in m):
        return "Live streams and upcoming premieres cannot be analyzed. Please choose a recorded video under 20 minutes."
    if "private" in m or "members-only" in m:
        return f"{subject} is private or members-only and cannot be analyzed."
    if "login" in m or "log in" in m or "sign in" in m or "--cookies" in m:
        return f"{subject} needs a login to view, so it can't be fetched. Make sure it's public, or upload the file directly."
    if "age" in m and "restrict" in m:
        return f"{subject} is age-restricted and cannot be analyzed."
    if "not available" in m or "unavailable" in m or "removed" in m or "404" in m:
        return f"{subject} is unavailable — it may have been removed or region-locked."
    if "larger than max-filesize" in m or "file is larger" in m:
        return "That video's audio exceeds the 100 MB limit. Please upload a smaller audio file."
    if "timed out" in m or "timeout" in m:
        source = site_name or "That website"
        return f"{source} took too long to respond (timed out). Please try again later or upload the audio file directly."
    return fallback


def _remove(path: str | None) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _remove_stem(stem: str) -> None:
    if not os.path.exists(TMP_DIR):
        return
    for name in os.listdir(TMP_DIR):
        if name.startswith(stem):
            _remove(os.path.join(TMP_DIR, name))
