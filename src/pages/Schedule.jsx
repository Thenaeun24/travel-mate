import React, { useState, useRef, useEffect } from 'react';
import { ReactSortable } from 'react-sortablejs';
import Map from '../components/Map';
import SortableTimeline from '../components/SortableTimeline';
import PlaceSearch from '../components/PlaceSearch';
import ShareButton from '../components/ShareButton';

// ── Mobile detection hook ─────────────────────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

const buildScheduleShareText = (folder) => {
  if (!folder) return '';
  const lines = [];
  lines.push(`✈️ ${folder.name} 일정`);
  const days = folder.days || [];
  days.forEach((day, i) => {
    const items = day.items || [];
    if (items.length === 0) return;
    lines.push('');
    lines.push(`📅 ${day.title || `Day ${i + 1}`}`);
    items.forEach((item) => {
      const time = item.time ? `${item.time} ` : '';
      const cat = item.category ? ` (${item.category})` : '';
      lines.push(`- ${time}${item.name}${cat}`);
    });
  });
  const storage = folder.items || [];
  if (storage.length > 0) {
    lines.push('');
    lines.push('🗂️ 보관함');
    storage.forEach((item) => {
      const cat = item.category ? ` (${item.category})` : '';
      lines.push(`- ${item.name}${cat}`);
    });
  }
  return lines.join('\n');
};

// ─── component ────────────────────────────────────────────────────────────────
const Schedule = ({ folders, setFolders, activeFolderId, setActiveFolderId }) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [routedDayIndex, setRoutedDayIndex] = useState(0);
  const [routeLegs, setRouteLegs] = useState([]);
  const [storageCategory, setStorageCategory] = useState('전체');
  const [storagePage, setStoragePage] = useState(0);
  const STORAGE_PAGE_SIZE = 5;
  const isMobile = useIsMobile();

  // ── Derived values ─────────────────────────────────────────────────────────
  const DEFAULT_FOLDER = {
    id: 'f1', name: '일본 오사카',
    items: [], days: [{ id: 'day1', title: 'Day 1', items: [] }, { id: 'day2', title: 'Day 2', items: [] }],
    expenses: [],
  };

  const activeFolder =
    folders.find((f) => f.id === activeFolderId) ||
    folders[0] ||
    DEFAULT_FOLDER;

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
        expenses: [],
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

  // Reset page when category changes
  const handleStorageCategoryChange = (cat) => {
    setStorageCategory(cat);
    setStoragePage(0);
  };

  // Long press: add item to a specific day (clone)
  const handleAddToDay = (item, day) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id !== activeFolderId) return folder;
        return {
          ...folder,
          days: (folder.days || []).map((d) => {
            if (d.id !== day.id) return d;
            const already = (d.items || []).some(
              (i) => (i.googlePlaceId && i.googlePlaceId === item.googlePlaceId) || i.id === item.id
            );
            if (already) return d;
            const cloned = { ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) };
            return { ...d, items: [...(d.items || []), cloned] };
          }),
        };
      })
    );
  };

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

        <div style={{ marginLeft: 'auto', paddingLeft: '8px' }}>
          <ShareButton
            label="일정 공유"
            getShareData={() => ({
              title: `${activeFolder.name} 일정`,
              text: buildScheduleShareText(activeFolder),
            })}
          />
        </div>
      </div>

      {/* Main Container */}
      <div className="schedule-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--color-bg)' }}>

        {/* LEFT: Map + Timeline */}
        <div className="schedule-col-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)' }}>

          <div className="schedule-map" style={{ flex: '0 0 38%', position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
            <Map
              storageMarkers={storageAndOtherMarkers}
              routeMarkers={routeMarkers}
              onRouteOptimized={handleRouteOptimized}
              onRouteCalculated={handleRouteCalculated}
              height="100%"
            />
          </div>

          <div className="schedule-timeline-wrap" style={{ flex: '0 0 62%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
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
                  onClick={() => handleStorageCategoryChange(cat)}
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
              {(() => {
                const filteredItems = storageCategory === '전체'
                  ? activeFolderItems
                  : activeFolderItems.filter((item) => (item.category || '기타') === storageCategory);

                // Pagination only on mobile
                const totalPages = isMobile ? Math.ceil(filteredItems.length / STORAGE_PAGE_SIZE) : 1;
                const safePage = isMobile ? Math.min(storagePage, Math.max(0, totalPages - 1)) : 0;
                const pagedItems = isMobile
                  ? filteredItems.slice(safePage * STORAGE_PAGE_SIZE, (safePage + 1) * STORAGE_PAGE_SIZE)
                  : filteredItems;

                return (
                  <>
                    <SortableTimeline
                      listId={storageCategory === '전체' ? '보관함' : `보관함 (${storageCategory})`}
                      items={pagedItems}
                      setItems={(newItems) => {
                        if (isMobile) {
                          const before = filteredItems.slice(0, safePage * STORAGE_PAGE_SIZE);
                          const after = filteredItems.slice((safePage + 1) * STORAGE_PAGE_SIZE);
                          handleActiveFolderItemsChange([...before, ...newItems, ...after]);
                        } else {
                          handleActiveFolderItemsChange(newItems);
                        }
                      }}
                      groupName="schedule"
                      onDelete={handleDeletePlace}
                      isCloneable={true}
                      scheduledPlaceIds={activeFolderDays.flatMap((day) =>
                        (day.items || []).map((item) => item.googlePlaceId || item.name)
                      )}
                      onLongPressItem={handleAddToDay}
                      days={activeFolderDays}
                    />

                    {/* Pagination controls: mobile only */}
                    {isMobile && totalPages > 1 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '12px', marginTop: '12px', paddingTop: '12px',
                        borderTop: '1px solid var(--color-border)',
                      }}>
                        <button
                          onClick={() => setStoragePage((p) => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            border: '1px solid var(--color-border)',
                            background: safePage === 0 ? 'var(--color-bg)' : 'var(--color-point)',
                            color: safePage === 0 ? 'var(--color-text-light)' : 'white',
                            cursor: safePage === 0 ? 'default' : 'pointer',
                            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}
                        >‹</button>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-light)', fontWeight: 'bold' }}>
                          {safePage + 1} / {totalPages}
                          <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>
                            ({filteredItems.length}개)
                          </span>
                        </span>
                        <button
                          onClick={() => setStoragePage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={safePage >= totalPages - 1}
                          style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            border: '1px solid var(--color-border)',
                            background: safePage >= totalPages - 1 ? 'var(--color-bg)' : 'var(--color-point)',
                            color: safePage >= totalPages - 1 ? 'var(--color-text-light)' : 'white',
                            cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}
                        >›</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
