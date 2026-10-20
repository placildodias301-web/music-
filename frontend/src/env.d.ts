/** App version from package.json, injected at build time (vite.config.ts). */
declare const __APP_VERSION__: string;

declare module "virtual:licences" {
  const licences: { name: string; version: string; licence: string; kind: "app" | "build" | "server" | "font" }[];
  export default licences;
}
