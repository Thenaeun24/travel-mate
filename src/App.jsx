import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ref, onValue, set } from 'firebase/database';
import { db } from './firebase';
import BottomTab from './components/BottomTab';
import Schedule from './pages/Schedule';
import Ledger from './pages/Ledger';

// ─── constants ────────────────────────────────────────────────────────────────
const FB_ROOT = 'travel-mate-app';
const LS_FOLDERS_KEY = 'visitor_tool_folders';
const LS_ACTIVE_FOLDER_KEY = 'visitor_tool_active_folder';

const DEFAULT_FOLDERS = [
  {
    id: 'f1',
    name: '일본 오사카',
    items: [],
    days: [
      { id: 'day1', title: 'Day 1', items: [] },
      { id: 'day2', title: 'Day 2', items: [] },
    ],
    expenses: [],
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
const toArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
};

const normalizeFolders = (data) => {
  const list = toArray(data);
  return list
    .filter((f) => f && typeof f === 'object')
    .map((folder) => ({
      ...folder,
      items: toArray(folder.items).filter((i) => i && typeof i === 'object'),
      days: toArray(folder.days)
        .filter((d) => d && typeof d === 'object')
        .map((day) => ({
          ...day,
          items: toArray(day.items).filter((i) => i && typeof i === 'object'),
        })),
      expenses: toArray(folder.expenses).filter((e) => e && typeof e === 'object'),
    }));
};

const loadFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(LS_FOLDERS_KEY);
    if (raw) {
      const parsed = normalizeFolders(JSON.parse(raw));
      if (parsed.length) return parsed;
    }
  } catch (_) {}
  return DEFAULT_FOLDERS;
};

const loadActiveFolderIdFromLocalStorage = (folders) => {
  try {
    const saved = localStorage.getItem(LS_ACTIVE_FOLDER_KEY);
    if (saved && folders.some((f) => f.id === saved)) return saved;
  } catch (_) {}
  return folders[0]?.id;
};

// ─── App Component ────────────────────────────────────────────────────────────
function App() {
  const [folders, setFolders] = useState(loadFromLocalStorage);
  const [activeFolderId, setActiveFolderId] = useState(() =>
    loadActiveFolderIdFromLocalStorage(loadFromLocalStorage())
  );

  // Firebase sync state
  const fbReadyRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const lastFbWriteRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  // ── EFFECT 1: Always save to localStorage immediately on every change ──────
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    const serialized = JSON.stringify(folders);
    localStorage.setItem(LS_FOLDERS_KEY, serialized);
  }, [folders]);

  // ── EFFECT 2: Firebase subscribe (load) ───────────────────────────────────
  useEffect(() => {
    const rootRef = ref(db, FB_ROOT);

    const unsubscribe = onValue(
      rootRef,
      (snapshot) => {
        const remote = snapshot.val();

        let remoteFolders = null;
        if (remote && typeof remote === 'object') {
          if ('folders' in remote) {
            remoteFolders = remote.folders;
          } else if (
            Array.isArray(remote) ||
            Object.keys(remote).every((k) => /^\d+$/.test(k))
          ) {
            remoteFolders = remote;
          }
        }

        const normalized = normalizeFolders(remoteFolders);

        if (normalized.length) {
          const serialized = JSON.stringify(normalized);

          if (!fbReadyRef.current) {
            isApplyingRemoteRef.current = true;
            setFolders(normalized);

            const savedId = localStorage.getItem(LS_ACTIVE_FOLDER_KEY);
            if (savedId && normalized.some((f) => f.id === savedId)) {
              setActiveFolderId(savedId);
            } else {
              setActiveFolderId(normalized[0]?.id);
            }

            lastFbWriteRef.current = serialized;
          } else if (serialized !== lastFbWriteRef.current) {
            isApplyingRemoteRef.current = true;
            setFolders(normalized);
            lastFbWriteRef.current = serialized;
          }
        }

        fbReadyRef.current = true;
      },
      (error) => {
        console.warn('Firebase onValue error:', error);
        fbReadyRef.current = true;
      }
    );

    const fallbackTimer = setTimeout(() => {
      if (!fbReadyRef.current) {
        console.warn('Firebase timeout – falling back to localStorage');
        fbReadyRef.current = true;
      }
    }, 6000);

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // ── EFFECT 3: Firebase save (only for user-triggered changes) ────────────
  useEffect(() => {
    if (isFirstRenderRef.current) return;

    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }

    const serialized = JSON.stringify(folders);
    if (serialized === lastFbWriteRef.current) return;

    lastFbWriteRef.current = serialized;
    set(ref(db, FB_ROOT), { folders, lastModifiedAt: Date.now() }).catch(
      (err) => console.error('Firebase write failed:', err)
    );
  }, [folders]);

  // ── Persist active folder selection ───────────────────────────────────────
  useEffect(() => {
    if (activeFolderId) {
      localStorage.setItem(LS_ACTIVE_FOLDER_KEY, activeFolderId);
    }
  }, [activeFolderId]);

  // Fallback if active folder was deleted.
  useEffect(() => {
    if (!folders.find((f) => f.id === activeFolderId)) {
      setActiveFolderId(folders[0]?.id);
    }
  }, [folders, activeFolderId]);

  return (
    <Router>
      <div className="app-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <header style={{ 
          padding: '16px', 
          background: 'white', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--color-text)', margin: 0, letterSpacing: '-0.5px' }}>
            나만의 해외여행 메이트
          </h1>
        </header>
        <div className="page-container" style={{ flex: 1, overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/schedule" replace />} />
            <Route
              path="/schedule"
              element={
                <Schedule
                  folders={folders}
                  setFolders={setFolders}
                  activeFolderId={activeFolderId}
                  setActiveFolderId={setActiveFolderId}
                />
              }
            />
            <Route
              path="/ledger"
              element={
                <Ledger
                  folders={folders}
                  setFolders={setFolders}
                  activeFolderId={activeFolderId}
                  setActiveFolderId={setActiveFolderId}
                />
              }
            />
          </Routes>
        </div>
        <BottomTab />
      </div>
    </Router>
  );
}

export default App;
