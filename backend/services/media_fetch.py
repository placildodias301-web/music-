"""
Media fetching from links - turns a pasted URL into a local audio/video
file that then goes through the normal /api/analyze path.

Two routes, picked automatically from the link's host:

* Social / streaming pages (YouTube, Shorts, Instagram Reels, TikTok,
  Facebook, X, SoundCloud, Vimeo, ...) are resolved with yt-dlp, which
  downloads just the audio stream when the site offers one.
* Anything else is treated as a direct link to a media file and streamed
  down with httpx.

Because the server fetches URLs on the user's behalf, every hop is checked
against private / loopback / link-local addresses so a pasted link can't be
used to probe the machine or its network.
"""

import ipaddress
import logging
import os
import re
import socket
import uuid
from urllib.parse import unquote, urljoin, urlparse

import httpx

from services.audio_extract import TMP_DIR

logger = logging.getLogger(__name__)

MAX_MEDIA_BYTES = 100 * 1024 * 1024  # matches the upload cap
MAX_DURATION_SECONDS = 20 * 60
MAX_REDIRECTS = 5

MEDIA_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".ogg", ".oga", ".opus", ".flac", ".aac", ".wma",
    ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v",
}

# Hosts handed to yt-dlp. Subdomains match too (m.youtube.com, vm.tiktok.com).
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


class MediaFetchError(Exception):
    """User-safe error - the message is shown in the UI as-is."""


def _host_matches(host: str, domains: tuple[str, ...]) -> bool:
    host = host.lower().rstrip(".")
    return any(host == d or host.endswith("." + d) for d in domains)


def _validate_url(url: str) -> str:
    url = (url or "").strip()
    if not url or len(url) > 2048:
        raise MediaFetchError("Please paste a valid link.")
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
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise MediaFetchError("Couldn't reach that website - check the link and try again.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise MediaFetchError("That link points to a private or local address, which isn't allowed.")


def _safe_name(name: str, fallback: str = "Linked track") -> str:
    name = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", name or "").strip()
    return (name or fallback)[:120]


def is_social_url(url: str) -> bool:
    host = urlparse(_validate_url(url)).hostname or ""
    return _host_matches(host, SOCIAL_HOSTS)


def fetch_media(url: str) -> tuple[str, str]:
    """
    Downloads the media behind `url` into TMP_DIR.
    Returns (local_path, display_file_name). Caller must clean up the path.
    """
    url = _validate_url(url)
    _assert_public_host(url)
    if is_social_url(url):
        return _download_social(url)
    return _download_direct(url)


def _download_direct(url: str) -> tuple[str, str]:
    path = None
    try:
        with httpx.Client(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
            for _ in range(MAX_REDIRECTS + 1):
                _assert_public_host(url)
                with client.stream("GET", url, follow_redirects=False) as r:
                    if r.is_redirect:
                        url = urljoin(url, r.headers.get("location", ""))
                        continue
                    if r.status_code >= 400:
                        raise MediaFetchError(f"That link returned an error (HTTP {r.status_code}).")

                    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    url_path = unquote(urlparse(str(r.url)).path)
                    base = os.path.basename(url_path)
                    ext = os.path.splitext(base)[1].lower()
                    is_media = ctype.startswith(("audio/", "video/")) or ext in MEDIA_EXTENSIONS
                    if not is_media:
                        raise MediaFetchError(
                            "That link isn't a direct audio or video file. For YouTube, Instagram, "
                            "TikTok and similar pages, use the YouTube & Social option."
                        )

                    length = int(r.headers.get("content-length") or 0)
                    if length > MAX_MEDIA_BYTES:
                        raise MediaFetchError("That file is too large (max 100MB).")

                    if ext not in MEDIA_EXTENSIONS:
                        ext = "." + ctype.split("/")[-1] if "/" in ctype else ""
                    path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext}")
                    size = 0
                    with open(path, "wb") as f:
                        for chunk in r.iter_bytes(1024 * 1024):
                            size += len(chunk)
                            if size > MAX_MEDIA_BYTES:
                                raise MediaFetchError("That file is too large (max 100MB).")
                            f.write(chunk)

                    name = os.path.splitext(base)[0] if base else "Linked track"
                    return path, _safe_name(name) + ext
            raise MediaFetchError("That link redirected too many times.")
    except MediaFetchError:
        _remove(path)
        raise
    except httpx.HTTPError as e:
        _remove(path)
        logger.info("Direct media download failed for %r: %s", url, e)
        raise MediaFetchError("Couldn't download that link - check it and try again.")


def _download_social(url: str) -> tuple[str, str]:
    try:
        import yt_dlp
        from yt_dlp.utils import DownloadError, match_filter_func
    except ImportError:  # pragma: no cover - dependency missing
        raise MediaFetchError("Link analysis isn't available on this server (yt-dlp is not installed).")

    stem = uuid.uuid4().hex
    opts = {
        # Audio-only stream when the site has one; otherwise the smallest full file.
        "format": "bestaudio[filesize<100M]/bestaudio/best[filesize<100M]/best",
        "outtmpl": os.path.join(TMP_DIR, f"{stem}.%(ext)s"),
        "noplaylist": True,
        "playlist_items": "1",
        "max_filesize": MAX_MEDIA_BYTES,
        "match_filter": match_filter_func(f"!is_live & duration <? {MAX_DURATION_SECONDS}"),
        # Never fall back to yt-dlp's generic page scraper for unknown sites.
        "allowed_extractors": ["default", "-generic"],
        "socket_timeout": 20,
        "retries": 2,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "cachedir": False,
        "http_headers": {"User-Agent": USER_AGENT},
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as e:
        _remove_stem(stem)
        raise MediaFetchError(_explain_ytdlp_error(str(e)))
    except Exception:
        _remove_stem(stem)
        logger.exception("yt-dlp failed for %r", url)
        raise MediaFetchError("Couldn't get audio from that link. Please try another one.")

    if info and info.get("entries"):
        info = next((e for e in info["entries"] if e), None)
    downloads = (info or {}).get("requested_downloads") or []
    path = downloads[0].get("filepath") if downloads else None
    if not path or not os.path.exists(path):
        _remove_stem(stem)
        # match_filter skips (rather than errors on) live streams and long videos
        if info and (info.get("is_live") or (info.get("duration") or 0) > MAX_DURATION_SECONDS):
            raise MediaFetchError("That video is too long or is a live stream (max 20 minutes).")
        logger.info("yt-dlp produced no file for %r", url)
        raise MediaFetchError("Couldn't get audio from that link. Please try another one.")

    ext = os.path.splitext(path)[1].lower()
    return path, _safe_name(info.get("title") or info.get("id") or "") + ext


def _explain_ytdlp_error(message: str) -> str:
    m = message.lower()
    if "unsupported url" in m or "no suitable extractor" in m:
        return "That link isn't supported. Try a YouTube, Shorts, Instagram Reel, TikTok or SoundCloud link."
    if "login" in m or "sign in" in m or "private" in m or "cookies" in m:
        return "That post is private or needs a login, so it can't be downloaded. Try a public link."
    if "age" in m and "restrict" in m:
        return "That video is age-restricted and can't be downloaded."
    if "not available" in m or "unavailable" in m or "removed" in m or "404" in m:
        return "That video is unavailable - it may have been removed or region-locked."
    if "larger than max-filesize" in m or "file is larger" in m:
        return "That media is too large (max 100MB)."
    logger.info("yt-dlp error: %s", message[-500:])
    return "Couldn't get audio from that link. Please try another one."


def _remove(path: str | None) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _remove_stem(stem: str) -> None:
    for name in os.listdir(TMP_DIR):
        if name.startswith(stem):
            _remove(os.path.join(TMP_DIR, name))
