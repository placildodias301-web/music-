import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MvpProvider } from "./lib/MvpContext";
import { AppShell } from "./components/AppShell";
import { Studio } from "./pages/Studio";
import { Upload } from "./pages/Upload";
import { Analysis } from "./pages/Analysis";
import { Practice } from "./pages/Practice";
import { Assistant } from "./pages/Assistant";
import { Tuner } from "./pages/Tuner";
import { ChordLibrary } from "./pages/ChordLibrary";
import { Dashboard } from "./pages/Dashboard";
import { Library } from "./pages/Library";
import { Community } from "./pages/Community";
import { Tools } from "./pages/Tools";
import { Account } from "./pages/Account";

function App() {
  return (
    <BrowserRouter>
      <MvpProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/studio" replace />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/tuner" element={<Tuner />} />
            <Route path="/chords" element={<ChordLibrary />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/community" element={<Community />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/account" element={<Account />} />
          </Routes>
        </AppShell>
      </MvpProvider>
    </BrowserRouter>
  );
}

export default App;
