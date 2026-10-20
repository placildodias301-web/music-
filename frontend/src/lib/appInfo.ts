/** Facts about this build, used by About, Help and the bug report. */

export const APP_NAME = "Wilsify AI";
export const APP_VERSION = __APP_VERSION__;
export const AUDIO_ENGINE = "librosa + FastAPI (Python)";
export const SUPPORT_EMAIL = "wilburfernandes8@gmail.com";

function browserInfo(): string {
  const ua = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string } }).userAgentData;
  const named = brands?.brands?.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ");
  return named ? `${named} on ${brands?.platform ?? "unknown OS"}` : ua;
}

/** mailto: link with the app version and browser details filled in. */
export function bugReportMailto(): string {
  const body = [
    "What happened?",
    "",
    "",
    "What did you expect?",
    "",
    "",
    "Steps to reproduce:",
    "1. ",
    "",
    "— Please keep the details below —",
    `App version: ${APP_VERSION}`,
    `Browser: ${browserInfo()}`,
    `Screen: ${window.screen.width}×${window.screen.height} (window ${window.innerWidth}×${window.innerHeight})`,
    `Page: ${window.location.pathname}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Bug report — Wilsify AI ${APP_VERSION}`)}&body=${encodeURIComponent(body)}`;
}

export function supportMailto(subject = "Wilsify AI support"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
