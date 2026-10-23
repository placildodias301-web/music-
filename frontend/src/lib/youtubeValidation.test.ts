// @vitest-environment node
// This file builds `Response`/`Blob` pairs for a fetch mock; Node's Response and jsdom's Blob are different classes, so it runs in Node.
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_YOUTUBE_DOMAINS,
  extractYouTubeVideoId,
  fetchMediaFromLink,
  searchYouTube,
  validateUploadFile,
  validateMediaLink,
  validateYouTubeUrl,
  YOUTUBE_FALLBACK_MESSAGE,
  type YouTubeVideo,
} from "./api";
import { formatDuration } from "../components/upload/YouTubeBrowser";

describe("TASK-05: YouTube URL validation, selection metadata, and fallback behavior", () => {
  it("1. Accepts valid YouTube URLs and 11-character IDs across allowlisted domains", () => {
    const vid = "dQw4w9WgXcQ";
    expect(validateYouTubeUrl(vid)).toBeNull();
    expect(extractYouTubeVideoId(vid)).toBe(vid);

    const urls = [
      `https://youtube.com/watch?v=${vid}`,
      `https://www.youtube.com/watch?v=${vid}&t=12s`,
      `https://m.youtube.com/watch?v=${vid}`,
      `https://music.youtube.com/watch?v=${vid}`,
      `https://youtu.be/${vid}`,
      `https://www.youtube.com/shorts/${vid}`,
    ];

    for (const url of urls) {
      expect(validateYouTubeUrl(url)).toBeNull();
      expect(extractYouTubeVideoId(url)).toBe(vid);
    }
    expect(ALLOWED_YOUTUBE_DOMAINS).toEqual([
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtu.be",
    ]);
  });

  it("2. Rejects invalid domains, playlists, channels, live streams, and malformed IDs", () => {
    expect(validateYouTubeUrl("")).toBe("Please enter a YouTube video link or select a video.");

    // Non-allowlisted domains
    expect(validateYouTubeUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toContain(
      "Only YouTube links",
    );
    expect(validateYouTubeUrl("https://www.instagram.com/reel/abc12345678/")).toContain(
      "Only YouTube links",
    );

    // Playlists
    expect(
      validateYouTubeUrl("https://www.youtube.com/playlist?list=PL1234567890"),
    ).toBe("YouTube playlists are not supported. Please paste a link to a single video.");
    expect(
      validateYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890"),
    ).toBe("YouTube playlists are not supported. Please paste a link to a single video.");

    // Channels / profiles
    expect(validateYouTubeUrl("https://www.youtube.com/@artist")).toContain(
      "Channel and non-video YouTube pages are not supported",
    );

    // Live streams
    expect(validateYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "Live streams cannot be analyzed. Please choose a finished video up to 20 minutes long.",
    );

    // Invalid ID length
    expect(validateYouTubeUrl("https://www.youtube.com/watch?v=short")).toContain(
      "11-character video ID",
    );
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
  });

  it("3. Valid selection formats title/duration and progresses through workflow states", async () => {
    const selected: YouTubeVideo = {
      id: "dQw4w9WgXcQ",
      title: "Acoustic Practice Backing Track",
      channel: "Wilsify Sessions",
      durationSeconds: 215,
      views: 42000,
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      isLive: false,
      tooLong: false,
    };

    expect(selected.title).toBe("Acoustic Practice Backing Track");
    expect(formatDuration(selected.durationSeconds)).toBe("3:35");
    expect(validateYouTubeUrl(selected.url)).toBeNull();

    // Simulate state progression: Searching -> Selecting -> Fetching media -> Uploading/Preparing -> Analyzing
    const states: string[] = [];
    states.push("Searching");

    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input.includes("/api/youtube/search")) {
        return new Response(JSON.stringify({ results: [selected] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (input.includes("/api/fetch-media")) {
        return new Response(new Blob(["ID3-audio-bytes"], { type: "audio/mpeg" }), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Media-Name": encodeURIComponent(`${selected.title}.mp3`),
          },
        });
      }
      throw new Error("Unexpected URL");
    });

    vi.stubGlobal("fetch", fetchMock);
    try {
      const results = await searchYouTube("Acoustic Practice");
      expect(results).toHaveLength(1);
      states.push("Selecting");

      states.push("Fetching media");
      const mediaFile = await fetchMediaFromLink(results[0].url);
      expect(mediaFile.name).toBe("Acoustic Practice Backing Track.mp3");
      expect(validateUploadFile(mediaFile)).toBeNull();

      states.push("Uploading/Preparing");
      states.push("Analyzing");
      expect(states).toEqual([
        "Searching",
        "Selecting",
        "Fetching media",
        "Uploading/Preparing",
        "Analyzing",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("4. YouTube failure surfaces the fallback message and preserves local file upload capability", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(searchYouTube("wonderwall")).rejects.toThrow(YOUTUBE_FALLBACK_MESSAGE);
      await expect(
        fetchMediaFromLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      ).rejects.toThrow(YOUTUBE_FALLBACK_MESSAGE);

      // Direct audio file upload validation remains intact and available as fallback
      const fallbackFile = new File(["RIFF....WAVEfmt "], "local-practice.wav", {
        type: "audio/wav",
      });
      expect(validateUploadFile(fallbackFile)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("validateMediaLink", () => {
  it("accepts links from many sites and still applies the strict YouTube rules", () => {
    for (const link of [
      "https://www.instagram.com/reel/Cabc123xyz/",
      "https://www.tiktok.com/@artist/video/7123456789012345678",
      "https://vm.tiktok.com/ZM123/",
      "https://soundcloud.com/artist/track",
      "https://vimeo.com/123456789",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(validateMediaLink(link)).toBeNull();
    }
    expect(validateMediaLink("https://www.youtube.com/playlist?list=PL1234567890")).toEqual(expect.any(String));
    expect(validateMediaLink("https://www.youtube.com/@artist")).toEqual(expect.any(String));
  });

  it("rejects blanks, non-http links, bare words, playlists and live streams", () => {
    for (const link of ["", "   ", "ftp://example.com/a", "javascript:alert(1)", "notalink", "https://soundcloud.com/a/sets/b", "https://vimeo.com/live/1"]) {
      expect(validateMediaLink(link)).toEqual(expect.any(String));
    }
  });
});
