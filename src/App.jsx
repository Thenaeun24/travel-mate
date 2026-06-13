import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ref, onValue, runTransaction } from 'firebase/database';
import { db } from './firebase';
import BottomTab from './components/BottomTab';
import Schedule from './pages/Schedule';
import Ledger from './pages/Ledger';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginGate from './components/LoginGate';
import UserAdmin from './components/UserAdmin';

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

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const normalizeFolders = (data) => {
  const list = toArray(data);
  // 데이터 전체에서 항목 id가 중복/누락되면 순서 변경(드래그)과 React 렌더링이
  // 깨지므로, 처음 보는 id만 유지하고 중복/빈 id는 새 고유 id로 교정한다.
  const seenIds = new Set();
  const fixId = (item) => {
    let id = item.id;
    if (id == null || id === '' || seenIds.has(id)) {
      do { id = genId(); } while (seenIds.has(id));
      item = { ...item, id };
    }
    seenIds.add(id);
    return item;
  };
  return list
    .filter((f) => f && typeof f === 'object')
    .map((folder) => ({
      ...folder,
      items: toArray(folder.items).filter((i) => i && typeof i === 'object').map(fixId),
      days: toArray(folder.days)
        .filter((d) => d && typeof d === 'object')
        .map((day) => ({
          ...day,
          items: toArray(day.items).filter((i) => i && typeof i === 'object').map(fixId),
        })),
      expenses: toArray(folder.expenses).filter((e) => e && typeof e === 'object'),
    }));
};

const extractRemoteFolders = (remote) => {
  if (!remote || typeof remote !== 'object') return null;
  if ('folders' in remote) return remote.folders;
  if (Array.isArray(remote) || Object.keys(remote).every((k) => /^\d+$/.test(k))) {
    return remote;
  }
  return null;
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

// ─── App data + UI (mounts only once the user is signed in & authorized) ───────
function AppContent() {
  const { user, isOwner, signOut } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  const [folders, setLocalFolders] = useState(loadFromLocalStorage);
  const [activeFolderId, setActiveFolderId] = useState(() =>
    loadActiveFolderIdFromLocalStorage(loadFromLocalStorage())
  );

  // Always-fresh ref to current folders (used inside transaction closures)
  const foldersRef = useRef(folders);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  // Firebase sync state
  const fbReadyRef = useRef(false);
  const lastWrittenSerializedRef = useRef(null);
  const pendingTxCountRef = useRef(0);
  const isFirstRenderRef = useRef(true);

  // ── setFolders wrapper: optimistic local update + atomic Firebase write ────
  const setFolders = useCallback((updater) => {
    const isFn = typeof updater === 'function';

    // 1) Optimistic local update — UI stays responsive
    setLocalFolders((prev) => (isFn ? updater(prev) : updater));

    // 2) If Firebase isn't ready yet, skip remote write to avoid clobbering
    //    real remote data with stale defaults. The first remote snapshot will
    //    reconcile, and subsequent edits will start syncing.
    if (!fbReadyRef.current) return;

    const rootRef = ref(db, FB_ROOT);
    pendingTxCountRef.current += 1;

    runTransaction(
      rootRef,
      (current) => {
        // currentData can be null on the very first write or if the node was
        // wiped externally. NEVER apply the updater to a fresh empty array —
        // that's how all folders disappear at once. Use our latest local state
        // as the base instead.
        let baseFolders;
        if (current === null) {
          baseFolders = normalizeFolders(foldersRef.current);
        } else {
          baseFolders = normalizeFolders(extractRemoteFolders(current));
          // Edge case: remote exists but parses to empty. Prefer local snapshot
          // over wiping — same defensive reason as above.
          if (baseFolders.length === 0 && foldersRef.current.length > 0) {
            baseFolders = normalizeFolders(foldersRef.current);
          }
        }

        const next = isFn ? updater(baseFolders) : updater;
        const safeNext = normalizeFolders(next);

        return { folders: safeNext, lastModifiedAt: Date.now() };
      },
      { applyLocally: false }
    )
      .then((result) => {
        if (result.committed && result.snapshot) {
          const written = result.snapshot.val();
          const writtenFolders = normalizeFolders(extractRemoteFolders(written));
          lastWrittenSerializedRef.current = JSON.stringify(writtenFolders);
        }
      })
      .catch((err) => {
        console.error('Firebase transaction failed:', err);
      })
      .finally(() => {
        pendingTxCountRef.current -= 1;
      });
  }, []);

  // ── EFFECT 1: Always save to localStorage immediately ─────────────────────
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    try {
      localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(folders));
    } catch (_) {}
  }, [folders]);

  // ── EFFECT 2: Subscribe to Firebase remote changes ────────────────────────
  useEffect(() => {
    const rootRef = ref(db, FB_ROOT);

    const unsubscribe = onValue(
      rootRef,
      (snapshot) => {
        const remote = snapshot.val();
        const remoteFolders = extractRemoteFolders(remote);
        const normalized = normalizeFolders(remoteFolders);
        const serialized = JSON.stringify(normalized);

        if (!fbReadyRef.current) {
          // First sync: only adopt remote data if it actually has content.
          // Otherwise keep local state — it will be pushed up on first edit.
          if (normalized.length > 0) {
            setLocalFolders(normalized);
            const savedId = localStorage.getItem(LS_ACTIVE_FOLDER_KEY);
            if (savedId && normalized.some((f) => f.id === savedId)) {
              setActiveFolderId(savedId);
            } else {
              setActiveFolderId(normalized[0]?.id);
            }
            lastWrittenSerializedRef.current = serialized;
          }
          fbReadyRef.current = true;
          return;
        }

        // Subsequent updates: apply only if different from what we just wrote.
        // This filters out our own echoes and prevents needless re-renders.
        if (serialized === lastWrittenSerializedRef.current) return;

        // If we have transactions in flight, the snapshot might be stale
        // relative to our optimistic state. Skip — the next echo (after our
        // tx commits) will be authoritative.
        if (pendingTxCountRef.current > 0) return;

        if (normalized.length > 0) {
          setLocalFolders(normalized);
          lastWrittenSerializedRef.current = serialized;
        }
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
          padding: '12px 16px',
          background: 'white',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <h1 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--color-text)', margin: 0, letterSpacing: '-0.5px' }}>
            나만의 해외여행 메이트
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isOwner && (
              <button
                onClick={() => setShowAdmin(true)}
                style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                👥 사용자
              </button>
            )}
            <button
              onClick={signOut}
              title={user?.email || ''}
              style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text-light)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              로그아웃
            </button>
          </div>
        </header>
        {showAdmin && <UserAdmin onClose={() => setShowAdmin(false)} />}
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

// ─── Root: auth provider + login gate around the actual app ───────────────────
// AppContent (and therefore the Firebase data subscription/writes) only mounts
// once the user is signed in AND authorized, so unauthorized sessions never
// touch the protected node.
function App() {
  return (
    <AuthProvider>
      <LoginGate>
        <AppContent />
      </LoginGate>
    </AuthProvider>
  );
}

export default App;
