import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { MvpProvider } from "./lib/MvpContext";
import { useEffect } from "react";
import { SettingsProvider } from "./lib/settings/SettingsProvider";
import { useSettings } from "./lib/settings/settingsContext";
import { pruneLibrary } from "./lib/library";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Studio } from "./pages/Studio";
import { Upload } from "./pages/Upload";
import { Analysis } from "./pages/Analysis";
import { Practice } from "./pages/Practice";
import { Assistant } from "./pages/Assistant";
import { Tuner } from "./pages/Tuner";
import { ChordLibrary } from "./pages/ChordLibrary";
import { Dashboard } from "./pages/Dashboard";
import { Library } from "./pages/Library";
import { Song } from "./pages/Song";
import { Community } from "./pages/Community";
import { Tools } from "./pages/Tools";
import { Stems } from "./pages/Stems";
import { SettingsHome } from "./pages/settings/SettingsHome";
import { EditProfile } from "./pages/settings/EditProfile";
import { AccountSettings } from "./pages/settings/AccountSettings";
import { PrivacySettings } from "./pages/settings/PrivacySettings";
import { NotificationSettings } from "./pages/settings/NotificationSettings";
import { Plans } from "./pages/settings/Plans";
import { HelpSupport } from "./pages/settings/HelpSupport";
import { About } from "./pages/settings/About";
import { KeyboardShortcuts } from "./pages/settings/KeyboardShortcuts";
import { Login } from "./pages/auth/Login";
import { Signup } from "./pages/auth/Signup";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { VerifyEmail } from "./pages/auth/VerifyEmail";
import { ResetPassword } from "./pages/auth/ResetPassword";

/** Applies "Analysis history" retention once the account's Library is loaded. */
function useHistoryRetention(ready: boolean) {
  const { settings } = useSettings();
  const retention = settings.storage.historyRetention;
  useEffect(() => {
    if (ready && retention !== "forever") pruneLibrary(Number(retention));
  }, [ready, retention]);
}

function SupabaseSetupScreen({ message }: { message: string }) {
  return (
    <div className="ns-scope flex min-h-screen items-center justify-center bg-[var(--color-ns-bg)] px-4 text-[var(--color-ns-text)]">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-[var(--color-ns-card)] p-6 shadow-xl"
      >
        <h1 className="font-heading text-lg font-bold text-[var(--color-ns-text)]">Supabase Setup Required</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ns-muted)]">{message}</p>
        <div className="mt-4 rounded-xl border border-[var(--color-ns-border)] bg-[var(--color-ns-bg-2)] p-3.5 font-mono text-xs text-[var(--color-ns-text)]">
          <p className="text-[var(--color-ns-muted)]"># frontend/.env</p>
          <p className="mt-1">VITE_SUPABASE_URL=https://&lt;your-project-ref&gt;.supabase.co</p>
          <p>VITE_SUPABASE_PUBLISHABLE_KEY=&lt;your-anon-or-publishable-key&gt;</p>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ns-muted)]">
          After updating <code className="text-[var(--color-ns-text)]">frontend/.env</code>, restart the Vite dev server and reload this page.
        </p>
      </div>
    </div>
  );
}

function SessionCheckScreen({ timedOut, onRetry }: { timedOut: boolean; onRetry: () => void }) {
  return (
    <div className="ns-scope flex min-h-screen items-center justify-center bg-[var(--color-ns-bg)] px-4 text-[var(--color-ns-text)]">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-2xl border border-[var(--color-ns-border)] bg-[var(--color-ns-card)] p-6 text-center shadow-xl"
      >
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-ns-purple-light)] border-t-transparent" />
        <h1 className="font-heading text-base font-bold text-[var(--color-ns-text)]">Checking your session...</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ns-muted)]">
          {timedOut
            ? "Taking longer than expected to reach the authentication service. Check your connection and try again."
            : "Verifying your account before opening Wilsify Studio."}
        </p>
        {timedOut && (
          <button
            type="button"
            onClick={onRetry}
            className="ns-btn-primary mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-bold"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function Layout() {
  const { status, user, session, configError, retrySession } = useAuth();
  useHistoryRetention(status === "authenticated" && Boolean(user && session));
  const location = useLocation();

  if (status === "config_error" && configError) {
    return <SupabaseSetupScreen message={configError} />;
  }
  if (status === "loading" || status === "timeout") {
    return <SessionCheckScreen timedOut={status === "timeout"} onRetry={retrySession} />;
  }
  if (status === "unauthenticated" || !session || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
          message: "Please sign in to continue.",
        }}
      />
    );
  }
  return (
    <MvpProvider>
      <AppShell>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </AppShell>
    </MvpProvider>
  );
}

// A data router (rather than <BrowserRouter>) so pages can block navigation
// while they have unsaved changes (Edit Profile).
const router = createBrowserRouter([
  // Sign in / sign up are full-screen pages, outside the app shell.
  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "/reset-password", element: <ResetPassword /> },
  {
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: "/", element: <Navigate to="/studio" replace /> },
      { path: "/studio", element: <Studio /> },
      { path: "/upload", element: <Upload /> },
      { path: "/analysis", element: <Analysis /> },
      { path: "/practice", element: <Practice /> },
      { path: "/assistant", element: <Assistant /> },
      { path: "/tuner", element: <Tuner /> },
      { path: "/chords", element: <ChordLibrary /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/library", element: <Library /> },
      { path: "/song/:songId", element: <Song /> },
      { path: "/community", element: <Community /> },
      { path: "/stems", element: <Stems /> },
      { path: "/tools", element: <Tools /> },
      { path: "/account", element: <Navigate to="/settings" replace /> },
      { path: "/settings", element: <SettingsHome /> },
      { path: "/settings/profile", element: <EditProfile /> },
      { path: "/settings/account", element: <AccountSettings /> },
      { path: "/settings/privacy", element: <PrivacySettings /> },
      { path: "/settings/notifications", element: <NotificationSettings /> },
      { path: "/settings/plans", element: <Plans /> },
      { path: "/settings/help", element: <HelpSupport /> },
      { path: "/settings/about", element: <About /> },
      { path: "/settings/shortcuts", element: <KeyboardShortcuts /> },
      { path: "*", element: <Navigate to="/studio" replace /> },
    ],
  },
]);

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
