import React, { useState, useRef, useEffect } from 'react';
import { ReactSortable } from 'react-sortablejs';
import Map from '../components/Map';
import SortableTimeline from '../components/SortableTimeline';
import PlaceSearch from '../components/PlaceSearch';
import { db } from '../firebase';
import { ref, onValue, set } from 'firebase/database';

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

// ─── component ────────────────────────────────────────────────────────────────
const Schedule = () => {
  const [folders, setFolders] = useState(loadFromLocalStorage);
  const [activeFolderId, setActiveFolderId] = useState(() =>
    loadActiveFolderIdFromLocalStorage(loadFromLocalStorage())
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [routedDayIndex, setRoutedDayIndex] = useState(0);
  const [routeLegs, setRouteLegs] = useState([]);
  const [storageCategory, setStorageCategory] = useState('전체');

  // Firebase sync state – does NOT block localStorage saving.
  const fbReadyRef = useRef(false);
  const isApplyingRemoteRef = useRef(false);
  const lastFbWriteRef = useRef(null);
  // Track whether this is the very first render after mount so we can
  // distinguish "initial state" from "user-triggered state change".
  const isFirstRenderRef = useRef(true);

  // ── EFFECT 1: Always save to localStorage immediately on every change ──────
  // This is COMPLETELY independent of Firebase. Even if Firebase is down,
  // data is always persisted locally so refresh works.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      // Don't overwrite localStorage with the initial value we just read from it.
      isFirstRenderRef.current = false;
      return;
    }
    // If this change came from Firebase, still save to localStorage (keep cache fresh).
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
            // Very first Firebase snapshot:
            // Firebase data wins – it is the canonical source of truth.
            isApplyingRemoteRef.current = true;
            setFolders(normalized);

            // Restore saved active folder, validate against real data.
            const savedId = localStorage.getItem(LS_ACTIVE_FOLDER_KEY);
            if (savedId && normalized.some((f) => f.id === savedId)) {
              setActiveFolderId(savedId);
            } else {
              setActiveFolderId(normalized[0]?.id);
            }

            lastFbWriteRef.current = serialized;
          } else if (serialized !== lastFbWriteRef.current) {
            // Later snapshot from another device / tab.
            isApplyingRemoteRef.current = true;
            setFolders(normalized);
            lastFbWriteRef.current = serialized;
          }
        }

        fbReadyRef.current = true;
      },
      (error) => {
        // Firebase error (e.g. no network, permission denied).
        // Mark as ready so saves still work via localStorage.
        console.warn('Firebase onValue error:', error);
        fbReadyRef.current = true;
      }
    );

    // Fallback: if Firebase doesn't respond within 6 seconds, mark ready
    // so the UI is never stuck (happens on slow mobile connections).
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
    // Skip if this update was triggered by applying a remote snapshot.
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }

    // Skip the initial render.
    if (!fbReadyRef.current) return;

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

  // ── Derived values ─────────────────────────────────────────────────────────
  const activeFolder =
    folders.find((f) => f.id === activeFolderId) ||
    folders[0] ||
    DEFAULT_FOLDERS[0];

  const activeFolderDays = activeFolder.days || [];
  const activeFolderItems = activeFolder.items || [];
  const routeMarkers = activeFolderDays[routedDayIndex]?.items || [];
  const routePlaceIds = new Set(
    routeMarkers.map((m) => m.googlePlaceId || m.name)
  );
  const storageAndOtherMarkers = [
    ...activeFolderItems,
    ...activeFolderDays
      .filter((_, idx) => idx !== routedDayIndex)
      .flatMap((d) => d.items || []),
  ].filter((m) => !routePlaceIds.has(m.googlePlaceId || m.name));

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleAddPlace = (newPlace) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id === activeFolderId) {
          const items = folder.items || [];
          if (!items.find((item) => item.id === newPlace.id)) {
            return { ...folder, items: [newPlace, ...items] };
          }
        }
        return folder;
      })
    );
  };

  const handleDeletePlace = (placeId) => {
    setFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        items: (folder.items || []).filter((item) => item.id !== placeId),
        days: (folder.days || []).map((day) => ({
          ...day,
          items: (day.items || []).filter((item) => item.id !== placeId),
        })),
      }))
    );
  };

  const handleActiveFolderItemsChange = (newItems) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id === activeFolderId) {
          if (storageCategory === '전체') {
            return { ...folder, items: newItems };
          }
          const otherItems = (folder.items || []).filter(
            (item) => (item.category || '기타') !== storageCategory
          );
          return { ...folder, items: [...otherItems, ...newItems] };
        }
        return folder;
      })
    );
  };

  const handleDayItemsChange = (dayId, newItems) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id === activeFolderId) {
          return {
            ...folder,
            days: (folder.days || []).map((day) =>
              day.id === dayId ? { ...day, items: newItems } : day
            ),
          };
        }
        return folder;
      })
    );
  };

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      const newFolder = {
        id: 'f' + Date.now(),
        name: newFolderName.trim(),
        items: [],
        days: [
          { id: 'day1', title: 'Day 1', items: [] },
          { id: 'day2', title: 'Day 2', items: [] },
        ],
      };
      setFolders((prev) => [...prev, newFolder]);
      setActiveFolderId(newFolder.id);
      setNewFolderName('');
      setIsAddingFolder(false);
    }
  };

  const handleDeleteFolder = (folderId, e) => {
    e.stopPropagation();
    if (folders.length === 1)
      return alert('최소 1개의 여행지는 필요합니다.');
    if (window.confirm('이 여행지를 삭제하시겠습니까? (내부 데이터 모두 삭제)')) {
      const newFolders = folders.filter((f) => f.id !== folderId);
      setFolders(newFolders);
      if (activeFolderId === folderId) setActiveFolderId(newFolders[0].id);
    }
  };

  const handleAddDay = () => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id === activeFolderId) {
          const days = folder.days || [];
          const nextNum = days.length + 1;
          return {
            ...folder,
            days: [
              ...days,
              { id: 'day' + Date.now(), title: `Day ${nextNum}`, items: [] },
            ],
          };
        }
        return folder;
      })
    );
  };

  const handleDeleteDay = (dayId) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id === activeFolderId) {
          return {
            ...folder,
            days: (folder.days || []).filter((d) => d.id !== dayId),
          };
        }
        return folder;
      })
    );
  };

  const handleRouteOptimized = (optimizedOrderIndices) => {
    const currentDay = activeFolderDays[routedDayIndex];
    const currentItems = currentDay?.items || [];
    if (
      currentDay &&
      optimizedOrderIndices &&
      optimizedOrderIndices.length === currentItems.length - 2
    ) {
      const start = currentItems[0];
      const end = currentItems[currentItems.length - 1];
      const waypoints = currentItems.slice(1, -1);
      const newWaypoints = optimizedOrderIndices.map((i) => waypoints[i]);
      const optimizedItems = [start, ...newWaypoints, end];
      const isChanged = optimizedItems.some(
        (item, i) => item.id !== currentItems[i].id
      );
      if (isChanged) handleDayItemsChange(currentDay.id, optimizedItems);
    }
  };

  const handleRouteCalculated = (legs) => setRouteLegs(legs);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="schedule-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Folder / Country Bar */}
      <div className="flex-row schedule-folder-bar" style={{
        padding: '12px 16px',
        background: 'var(--color-card)',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        gap: '8px',
      }}>
        <div style={{ fontWeight: 'bold', marginRight: '8px', color: 'var(--color-point)' }}>✈️ 여행지:</div>
        <ReactSortable
          list={folders}
          setList={(newList) => {
            const oldIds = folders.map((f) => f.id).join(',');
            const newIds = newList.map((f) => f.id).join(',');
            if (oldIds !== newIds) setFolders(newList);
          }}
          animation={150}
          style={{ display: 'flex', gap: '8px' }}
        >
          {folders.map((f) => (
            <div key={f.id} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setActiveFolderId(f.id)}
                style={{
                  padding: '8px 16px', borderRadius: '20px', border: 'none',
                  background: f.id === activeFolderId ? 'var(--color-point)' : 'var(--color-bg)',
                  color: f.id === activeFolderId ? 'white' : 'var(--color-text)',
                  fontWeight: f.id === activeFolderId ? 'bold' : 'normal',
                  cursor: 'pointer', transition: 'background 0.2s',
                  boxShadow: f.id === activeFolderId ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {f.name}
              </button>
              {folders.length > 1 && (
                <button
                  onClick={(e) => handleDeleteFolder(f.id, e)}
                  style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    background: '#ff4d4f', color: 'white', borderRadius: '50%',
                    width: '16px', height: '16px', fontSize: '10px', border: 'none',
                    cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </ReactSortable>

        {isAddingFolder ? (
          <div className="flex-row" style={{ gap: '4px' }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="새 여행지 입력..."
              style={{ padding: '8px 12px', borderRadius: '20px', border: '1px solid var(--color-border)', outline: 'none', width: '130px' }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') handleAddFolder();
              }}
              autoFocus
            />
            <button onClick={handleAddFolder} style={{ background: 'var(--cat-cafe)', color: 'var(--color-text)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontWeight: 'bold' }}>✓</button>
            <button onClick={() => setIsAddingFolder(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text-light)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingFolder(true)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: '1px dashed var(--color-border)',
              background: 'transparent', color: 'var(--color-text-light)', cursor: 'pointer',
            }}
          >
            + 추가
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="schedule-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--color-bg)' }}>

        {/* LEFT: Map + Timeline */}
        <div className="schedule-col-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)' }}>

          <div className="schedule-map" style={{ flex: 1, position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
            <Map
              storageMarkers={storageAndOtherMarkers}
              routeMarkers={routeMarkers}
              onRouteOptimized={handleRouteOptimized}
              onRouteCalculated={handleRouteCalculated}
              height="100%"
            />
          </div>

          <div className="schedule-timeline-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
            <div className="schedule-timeline-card" style={{ background: 'var(--color-card)', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '15px', overflowX: 'auto', whiteSpace: 'nowrap', marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--color-text)' }}>🗓️ 일정:</div>
                {activeFolderDays.map((day, index) => (
                  <button
                    key={day.id}
                    onClick={() => setRoutedDayIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); if (routedDayIndex !== index) setRoutedDayIndex(index); }}
                    style={{
                      padding: '10px 24px', borderRadius: '30px', border: 'none',
                      background: index === routedDayIndex ? 'var(--color-point)' : 'var(--color-bg)',
                      color: index === routedDayIndex ? 'white' : 'var(--color-text)',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', transition: 'all 0.2s',
                      boxShadow: index === routedDayIndex ? '0 4px 12px rgba(0,0,0,0.12)' : 'none',
                    }}
                  >
                    Day {index + 1}
                  </button>
                ))}
                <button
                  onClick={handleAddDay}
                  style={{ padding: '8px 16px', borderRadius: '30px', border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-light)', cursor: 'pointer', fontSize: '13px' }}
                >
                  + Day 추가
                </button>
              </div>

              {activeFolderDays[routedDayIndex] && (
                <div className="schedule-timeline-day" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--color-text)', fontWeight: '800' }}>
                      📍 {activeFolderDays[routedDayIndex].title}
                    </h2>
                    <button
                      onClick={() => handleDeleteDay(activeFolderDays[routedDayIndex].id)}
                      style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid #ff4d4f', background: 'white', color: '#ff4d4f', cursor: 'pointer' }}
                    >
                      Day 삭제
                    </button>
                  </div>

                  <div className="schedule-timeline-list" style={{ flex: 1, overflowY: 'auto' }}>
                    <SortableTimeline
                      listId={activeFolderDays[routedDayIndex].title}
                      items={activeFolderDays[routedDayIndex].items}
                      setItems={(newItems) => handleDayItemsChange(activeFolderDays[routedDayIndex].id, newItems)}
                      groupName="schedule"
                      onDelete={handleDeletePlace}
                      routeLegs={routeLegs}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Search + Storage */}
        <div className="schedule-col-right" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', overflowY: 'auto' }}>
          <div className="schedule-search">
            <PlaceSearch onAddPlace={handleAddPlace} storageItems={activeFolderItems} />
          </div>

          <div className="schedule-storage" style={{ background: 'var(--color-card)', borderRadius: '15px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '15px', marginTop: 0, color: 'var(--color-text)', fontWeight: 'bold' }}>
              🗂️ 보관함
            </h2>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['전체', '관광명소', '맛집', '카페', '숙소', '기타'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setStorageCategory(cat)}
                  style={{
                    padding: '10px 18px', borderRadius: '25px', border: '1px solid var(--color-border)',
                    background: storageCategory === cat ? 'var(--color-point)' : 'white',
                    color: storageCategory === cat ? 'white' : 'var(--color-text-light)',
                    fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="schedule-storage-list" style={{ flex: 1, overflowY: 'auto' }}>
              <SortableTimeline
                listId={storageCategory === '전체' ? '보관함' : `보관함 (${storageCategory})`}
                items={
                  storageCategory === '전체'
                    ? activeFolderItems
                    : activeFolderItems.filter(
                        (item) => (item.category || '기타') === storageCategory
                      )
                }
                setItems={handleActiveFolderItemsChange}
                groupName="schedule"
                onDelete={handleDeletePlace}
                isCloneable={true}
                scheduledPlaceIds={activeFolderDays.flatMap((day) =>
                  (day.items || []).map((item) => item.googlePlaceId || item.name)
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
