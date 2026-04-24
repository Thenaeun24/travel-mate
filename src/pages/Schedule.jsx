import React, { useState, useRef } from 'react';
import { ReactSortable } from 'react-sortablejs';
import Map from '../components/Map';
import SortableTimeline from '../components/SortableTimeline';
import PlaceSearch from '../components/PlaceSearch';
import { db } from '../firebase';
import { ref, onValue, set } from 'firebase/database';

const initialFolder = {
  id: 'f1',
  name: '일본 오사카',
  items: [],
  days: [
    { id: 'day1', title: 'Day 1', items: [] },
    { id: 'day2', title: 'Day 2', items: [] }
  ]
};

// Firebase RTDB strips empty arrays and may return arrays as keyed objects
// (e.g. {"0": ..., "1": ...}). Normalize everything back to arrays with the
// required shape so the rest of the UI can rely on .map/.filter/.find.
const toArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
};

const normalizeFolders = (data) => {
  const list = toArray(data);
  return list.filter(Boolean).map(folder => ({
    ...folder,
    items: toArray(folder.items),
    days: toArray(folder.days).map(day => ({
      ...day,
      items: toArray(day.items)
    }))
  }));
};

const getInitialFolders = () => {
  try {
    const saved = localStorage.getItem('visitor_tool_folders');
    if (saved) {
      const parsed = normalizeFolders(JSON.parse(saved));
      if (parsed.length) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [initialFolder];
};

const getInitialActiveFolderId = (folders) => {
  try {
    const saved = localStorage.getItem('visitor_tool_active_folder');
    if (saved && folders.some(f => f.id === saved)) return saved;
  } catch (e) {
    console.error(e);
  }
  return folders[0]?.id;
};

const Schedule = () => {
  const [folders, setFolders] = useState(getInitialFolders);
  const [activeFolderId, setActiveFolderId] = useState(() => getInitialActiveFolderId(getInitialFolders()));
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [routedDayIndex, setRoutedDayIndex] = useState(0);
  const [routeLegs, setRouteLegs] = useState([]); // travel time between places
  const [storageCategory, setStorageCategory] = useState('전체');

  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  // Track the last snapshot applied from Firebase so we can suppress the
  // write-echo loop (set → onValue → setFolders → set → ...).
  const lastRemoteSnapshotRef = useRef(null);

  // Firebase Sync: Load data on mount
  React.useEffect(() => {
    const foldersRef = ref(db, 'travel-mate-app/folders');
    const unsubscribe = onValue(foldersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const normalized = normalizeFolders(data);
        if (normalized.length) {
          const serialized = JSON.stringify(normalized);
          lastRemoteSnapshotRef.current = serialized;
          setFolders(normalized);
        }
      }
      setIsFirebaseLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Sync: Save data on change
  React.useEffect(() => {
    if (isFirebaseLoading) return; // Don't sync back initial load or while loading
    const serialized = JSON.stringify(folders);
    // Skip writes that just echo what we just received from the server.
    if (serialized === lastRemoteSnapshotRef.current) return;
    lastRemoteSnapshotRef.current = serialized;
    const foldersRef = ref(db, 'travel-mate-app/folders');
    set(foldersRef, folders);
    localStorage.setItem('visitor_tool_folders', serialized);
  }, [folders, isFirebaseLoading]);

  // Persist the selected folder across refreshes.
  React.useEffect(() => {
    if (activeFolderId) {
      localStorage.setItem('visitor_tool_active_folder', activeFolderId);
    }
  }, [activeFolderId]);

  // Ensure active folder exists, fallback to first folder (or the default empty one)
  const activeFolder = folders.find(f => f.id === activeFolderId) || folders[0] || initialFolder;
  
  // Update activeFolderId if the current one was deleted
  React.useEffect(() => {
    if (!folders.find(f => f.id === activeFolderId)) {
      setActiveFolderId(folders[0]?.id);
    }
  }, [folders, activeFolderId]);



  const handleAddPlace = (newPlace) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        const items = folder.items || [];
        if (!items.find(item => item.id === newPlace.id)) {
          return { ...folder, items: [newPlace, ...items] };
        }
      }
      return folder;
    }));
  };

  const handleDeletePlace = (placeId) => {
    setFolders(prev => prev.map(folder => ({
      ...folder,
      items: (folder.items || []).filter(item => item.id !== placeId),
      days: (folder.days || []).map(day => ({
        ...day,
        items: (day.items || []).filter(item => item.id !== placeId)
      }))
    })));
  };

  const handleActiveFolderItemsChange = (newItems) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        if (storageCategory === '전체') {
          return { ...folder, items: newItems };
        } else {
          // Merge the newly ordered/added filtered items back into the original list
          // keeping items from other categories in their original relative positions
          const otherItems = (folder.items || []).filter(item => (item.category || '기타') !== storageCategory);
          return { ...folder, items: [...otherItems, ...newItems] };
        }
      }
      return folder;
    }));
  };

  const handleDayItemsChange = (dayId, newItems) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        return {
          ...folder,
          days: (folder.days || []).map(day => day.id === dayId ? { ...day, items: newItems } : day)
        };
      }
      return folder;
    }));
  };

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      const newFolder = {
        id: 'f' + Date.now(),
        name: newFolderName.trim(),
        items: [],
        days: [
          { id: 'day1', title: 'Day 1', items: [] },
          { id: 'day2', title: 'Day 2', items: [] }
        ]
      };
      setFolders([...folders, newFolder]);
      setActiveFolderId(newFolder.id);
      setNewFolderName('');
      setIsAddingFolder(false);
    }
  };

  const handleDeleteFolder = (folderId, e) => {
    e.stopPropagation();
    if(folders.length === 1) return alert("최소 1개의 여행지는 필요합니다.");
    if(window.confirm("이 여행지를 삭제하시겠습니까? (내부 데이터 모두 삭제)")) {
      const newFolders = folders.filter(f => f.id !== folderId);
      setFolders(newFolders);
      if(activeFolderId === folderId) setActiveFolderId(newFolders[0].id);
    }
  };

  const handleAddDay = () => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        const days = folder.days || [];
        const nextNum = days.length + 1;
        return {
          ...folder,
          days: [...days, { id: 'day' + Date.now(), title: `Day ${nextNum}`, items: [] }]
        };
      }
      return folder;
    }));
  };

  const handleDeleteDay = (dayId) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        return {
          ...folder,
          days: (folder.days || []).filter(d => d.id !== dayId)
        };
      }
      return folder;
    }));
  };

  const handleRouteOptimized = (optimizedOrderIndices) => {
    const currentDay = (activeFolderDays || [])[routedDayIndex];
    const currentItems = currentDay?.items || [];
    if (currentDay && optimizedOrderIndices && optimizedOrderIndices.length === currentItems.length - 2) {
      const start = currentItems[0];
      const end = currentItems[currentItems.length - 1];
      const waypoints = currentItems.slice(1, -1);
      
      const newWaypoints = optimizedOrderIndices.map(index => waypoints[index]);
      const optimizedItems = [start, ...newWaypoints, end];
      
      const isChanged = optimizedItems.some((item, i) => item.id !== currentItems[i].id);
      if (isChanged) {
        handleDayItemsChange(currentDay.id, optimizedItems);
      }
    }
  };

  const handleRouteCalculated = (legs) => {
    setRouteLegs(legs);
  };

  const activeFolderDays = activeFolderDays || [];
  const activeFolderItems = activeFolderItems || [];
  const routeMarkers = activeFolderDays[routedDayIndex]?.items || [];
  const routePlaceIds = new Set(routeMarkers.map(m => m.googlePlaceId || m.name));

  const storageAndOtherMarkers = [
    ...activeFolderItems,
    ...activeFolderDays.filter((_, idx) => idx !== routedDayIndex).flatMap(d => d.items || [])
  ].filter(m => !routePlaceIds.has(m.googlePlaceId || m.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Country/Folder Menu Bar */}
      <div className="flex-row" style={{ 
        padding: '12px 16px', 
        background: 'var(--color-card)', 
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto', 
        whiteSpace: 'nowrap', 
        gap: '8px'
      }}>
        <div style={{ fontWeight: 'bold', marginRight: '8px', color: 'var(--color-point)' }}>✈️ 여행지:</div>
        <ReactSortable 
          list={folders} 
          setList={setFolders} 
          animation={150} 
          style={{ display: 'flex', gap: '8px' }}
        >
          {folders.map(f => (
            <div key={f.id} style={{ position: 'relative', display: 'inline-block' }}>
              <button 
                onClick={() => setActiveFolderId(f.id)}
                style={{
                  padding: '8px 16px', borderRadius: '20px', border: 'none',
                  background: f.id === activeFolderId ? 'var(--color-point)' : 'var(--color-bg)',
                  color: f.id === activeFolderId ? 'white' : 'var(--color-text)',
                  fontWeight: f.id === activeFolderId ? 'bold' : 'normal',
                  cursor: 'pointer', transition: 'background 0.2s',
                  boxShadow: f.id === activeFolderId ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
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
                    cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'
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
                if(e.nativeEvent.isComposing) return;
                if(e.key === 'Enter') handleAddFolder();
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
              background: 'transparent', color: 'var(--color-text-light)', cursor: 'pointer'
            }}
          >
            + 추가
          </button>
        )}
      </div>

      {/* Main Container: 50/50 Left-Right Split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--color-bg)' }}>
        
        {/* LEFT COLUMN (50%): Map (Top) + Schedule (Bottom) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)' }}>
          
          {/* Top-Left: Google Map (50% Height) */}
          <div style={{ flex: 1, position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
            <Map 
              storageMarkers={storageAndOtherMarkers} 
              routeMarkers={routeMarkers} 
              onRouteOptimized={handleRouteOptimized}
              onRouteCalculated={handleRouteCalculated}
              height="100%"
            />
          </div>

          {/* Bottom-Left: Schedule Timeline (50% Height) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
            <div style={{ background: 'var(--color-card)', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Day Tabs Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '15px', overflowX: 'auto', whiteSpace: 'nowrap', marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--color-text)' }}>🗓️ 일정:</div>
                {activeFolderDays.map((day, index) => (
                  <button
                    key={day.id}
                    onClick={() => setRoutedDayIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (routedDayIndex !== index) setRoutedDayIndex(index);
                    }}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '30px',
                      border: 'none',
                      background: index === routedDayIndex ? 'var(--color-point)' : 'var(--color-bg)',
                      color: index === routedDayIndex ? 'white' : 'var(--color-text)',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '15px',
                      transition: 'all 0.2s',
                      boxShadow: index === routedDayIndex ? '0 4px 12px rgba(0,0,0,0.12)' : 'none'
                    }}
                  >
                    Day {index + 1}
                  </button>
                ))}
                <button 
                  onClick={handleAddDay}
                  style={{
                    padding: '8px 16px', borderRadius: '30px', border: '1px dashed var(--color-border)',
                    background: 'transparent', color: 'var(--color-text-light)', cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  + Day 추가
                </button>
              </div>

              {/* Active Day Content */}
              {activeFolderDays[routedDayIndex] && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--color-text)', fontWeight: '800' }}>
                      📍 {activeFolderDays[routedDayIndex].title}
                    </h2>
                    <button 
                      onClick={() => handleDeleteDay(activeFolderDays[routedDayIndex].id)}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid #ff4d4f',
                        background: 'white', color: '#ff4d4f', cursor: 'pointer'
                      }}
                    >
                      Day 삭제
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto' }}>
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

        {/* RIGHT COLUMN (50%): Search & Storage (Full Height) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', overflowY: 'auto' }}>
          <PlaceSearch onAddPlace={handleAddPlace} storageItems={activeFolderItems} />
          
          <div style={{ background: 'var(--color-card)', borderRadius: '15px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '15px', marginTop: 0, color: 'var(--color-text)', fontWeight: 'bold' }}>
              🗂️ 보관함
            </h2>
            
            {/* Storage Category Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['전체', '관광명소', '맛집', '카페', '숙소', '기타'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setStorageCategory(cat)}
                  style={{
                    padding: '10px 18px', borderRadius: '25px', border: '1px solid var(--color-border)',
                    background: storageCategory === cat ? 'var(--color-point)' : 'white',
                    color: storageCategory === cat ? 'white' : 'var(--color-text-light)',
                    fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <SortableTimeline 
                listId={storageCategory === '전체' ? "보관함" : `보관함 (${storageCategory})`}
                items={storageCategory === '전체' ? activeFolderItems : activeFolderItems.filter(item => (item.category || '기타') === storageCategory)} 
                setItems={handleActiveFolderItemsChange} 
                groupName="schedule" 
                onDelete={handleDeletePlace}
                isCloneable={true}
                scheduledPlaceIds={activeFolderDays.flatMap(day => (day.items || []).map(item => item.googlePlaceId || item.name))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
