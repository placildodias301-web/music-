/**
 * Plans and credit costs (shown on Settings → Plans). Payments aren't live
 * in the MVP and credits aren't charged during the beta; this is the one
 * place to change prices, credits or what each plan includes.
 */

import type { PlanId } from "./settings/model";

export const ANNUAL_DISCOUNT = 0.25;
export const CURRENCY = "₹";

export interface CreditFeature {
  id: string;
  label: string;
  /** Credits per use, e.g. 1, or per minute for live detection. */
  credits: number;
  unit?: string;
}

export const CREDIT_FEATURES: CreditFeature[] = [
  { id: "chords", label: "Chord detection", credits: 1 },
  { id: "bpm-key", label: "BPM + key", credits: 1 },
  { id: "tabs", label: "Guitar tabs", credits: 4 },
  { id: "midi", label: "MIDI export", credits: 2 },
  { id: "pdf", label: "Sheet music PDF", credits: 4 },
  { id: "live", label: "Live detection", credits: 2, unit: "min" },
  { id: "stems", label: "Stem separation", credits: 5 },
];

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price in rupees. */
  monthly: number;
  creditsPerMonth: number;
  /** Feature ids from CREDIT_FEATURES that the plan includes. */
  includes: string[];
  highlight?: "popular";
  buttonStyle: "secondary" | "primary" | "teal";
  cta: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try Wilsify on your own songs.",
    monthly: 0,
    creditsPerMonth: 50,
    includes: ["chords", "bpm-key", "tabs"],
    buttonStyle: "secondary",
    cta: "Get started",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For players learning songs every week.",
    monthly: 299,
    creditsPerMonth: 2500,
    includes: ["chords", "bpm-key", "tabs", "midi", "pdf", "live"],
    highlight: "popular",
    buttonStyle: "primary",
    cta: "Start free trial",
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "For teachers, bands and creators.",
    monthly: 699,
    creditsPerMonth: 5000,
    includes: CREDIT_FEATURES.map((f) => f.id),
    buttonStyle: "teal",
    cta: "Upgrade to Studio",
  },
];

export type Billing = "monthly" | "annual";

/** Price to show per month, and what's billed, for the chosen billing period. */
export function planPrice(plan: Plan, billing: Billing): { perMonth: number; billed: number; period: "month" | "year" } {
  if (billing === "monthly" || plan.monthly === 0) return { perMonth: plan.monthly, billed: plan.monthly, period: "month" };
  const yearly = Math.round(plan.monthly * 12 * (1 - ANNUAL_DISCOUNT));
  return { perMonth: Math.round(yearly / 12), billed: yearly, period: "year" };
}

export function formatRupees(amount: number): string {
  return `${CURRENCY}${amount.toLocaleString("en-IN")}`;
}
