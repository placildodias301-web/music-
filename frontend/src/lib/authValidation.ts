/**
 * Validation for the sign-in / sign-up / password screens. Pure functions,
 * so the rules are the same wherever a field appears and easy to move to
 * the server when real accounts arrive.
 */

// Practical email check: something@domain.tld, no spaces, a real-looking TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your email address.";
  if (v.length > 254) return "That email is too long.";
  if (!v.includes("@")) return "An email needs an @, e.g. name@example.com";
  if (!EMAIL_RE.test(v)) return "Enter a complete email, e.g. name@example.com";
  return null;
}

/** Common domain typos → the domain they probably meant. */
const DOMAIN_FIXES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "rediffmial.com": "rediffmail.com",
};

/** "wilbur@gmial.com" → "wilbur@gmail.com", or null when nothing looks mistyped. */
export function emailSuggestion(value: string): string | null {
  const v = value.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const fix = DOMAIN_FIXES[v.slice(at + 1)];
  return fix ? `${value.trim().slice(0, at)}@${fix}` : null;
}

export const PASSWORD_MIN = 8;

export interface PasswordRule {
  id: "length" | "number" | "symbol";
  label: string;
  ok: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { id: "number", label: "One number", ok: /\d/.test(password) },
    { id: "symbol", label: "One symbol", ok: /[^A-Za-z0-9\s]/.test(password) },
  ];
}

export type Strength = { score: 0 | 1 | 2 | 3; label: "Too short" | "Weak" | "Good" | "Strong" };

const COMMON = new Set(["password", "password1", "12345678", "123456789", "qwerty123", "iloveyou", "wilsify123", "11111111", "abc12345"]);

/** 0–3 strength for the meter: length, character variety, and no obvious patterns. */
export function passwordStrength(password: string): Strength {
  if (password.length < PASSWORD_MIN) return { score: 0, label: "Too short" };
  if (COMMON.has(password.toLowerCase())) return { score: 1, label: "Weak" };
  let points = 0;
  if (password.length >= 12) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9\s]/.test(password)) points++;
  if (/(.)\1{2,}/.test(password) || /(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(password)) points--;
  if (points >= 3) return { score: 3, label: "Strong" };
  if (points >= 2) return { score: 2, label: "Good" };
  return { score: 1, label: "Weak" };
}

/** Error for a new password (sign-up / reset), or null. */
export function newPasswordError(password: string, email = ""): string | null {
  if (!password) return "Choose a password.";
  const failed = passwordRules(password).find((r) => !r.ok);
  if (failed) return `Password needs ${failed.label.toLowerCase()}.`;
  const name = email.split("@")[0]?.toLowerCase();
  if (name && name.length >= 4 && password.toLowerCase().includes(name)) return "Don't use your email name in your password.";
  if (passwordStrength(password).score < 2) return "That password is easy to guess — add length or mix in capitals.";
  return null;
}

const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

export function nameError(value: string, required: boolean, label: string): string | null {
  const v = value.trim();
  if (!v) return required ? `Enter your ${label.toLowerCase()}.` : null;
  if (v.length > 50) return `${label} is too long.`;
  if (!NAME_RE.test(v)) return `${label} can only use letters, spaces, hyphens and apostrophes.`;
  return null;
}

export const OTP_LENGTH = 6;
