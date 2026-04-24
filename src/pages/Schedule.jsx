import React, { useState } from 'react';
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

const getInitialFolders = () => {
  try {
    const saved = localStorage.getItem('visitor_tool_folders');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return [initialFolder];
};

const Schedule = () => {
  const [folders, setFolders] = useState(getInitialFolders);
  const [activeFolderId, setActiveFolderId] = useState('f1');
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [routedDayIndex, setRoutedDayIndex] = useState(0); 
  const [routeLegs, setRouteLegs] = useState([]); // travel time between places

  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);

  // Firebase Sync: Load data on mount
  React.useEffect(() => {
    const foldersRef = ref(db, 'travel-mate-app/folders');
    const unsubscribe = onValue(foldersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setFolders(data);
      }
      setIsFirebaseLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Sync: Save data on change
  React.useEffect(() => {
    if (isFirebaseLoading) return; // Don't sync back initial load or while loading
    const foldersRef = ref(db, 'travel-mate-app/folders');
    set(foldersRef, folders);
    localStorage.setItem('visitor_tool_folders', JSON.stringify(folders));
  }, [folders, isFirebaseLoading]);

  // Ensure active folder exists, fallback to first folder
  const activeFolder = folders.find(f => f.id === activeFolderId) || folders[0];
  
  // Update activeFolderId if the current one was deleted
  React.useEffect(() => {
    if (!folders.find(f => f.id === activeFolderId)) {
      setActiveFolderId(folders[0]?.id);
    }
  }, [folders, activeFolderId]);



  const handleAddPlace = (newPlace) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        if (!folder.items.find(item => item.id === newPlace.id)) {
          return { ...folder, items: [newPlace, ...folder.items] };
        }
      }
      return folder;
    }));
  };

  const handleDeletePlace = (placeId) => {
    setFolders(prev => prev.map(folder => ({
      ...folder,
      items: folder.items.filter(item => item.id !== placeId),
      days: folder.days.map(day => ({
        ...day,
        items: day.items.filter(item => item.id !== placeId)
      }))
    })));
  };

  const handleActiveFolderItemsChange = (newItems) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        return { ...folder, items: newItems };
      }
      return folder;
    }));
  };

  const handleDayItemsChange = (dayId, newItems) => {
    setFolders(prev => prev.map(folder => {
      if (folder.id === activeFolderId) {
        return {
          ...folder,
          days: folder.days.map(day => day.id === dayId ? { ...day, items: newItems } : day)
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
        const nextNum = folder.days.length + 1;
        return {
          ...folder,
          days: [...folder.days, { id: 'day' + Date.now(), title: `Day ${nextNum}`, items: [] }]
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
          days: folder.days.filter(d => d.id !== dayId)
        };
      }
      return folder;
    }));
  };

  const handleRouteOptimized = (optimizedOrderIndices) => {
    const currentDay = activeFolder.days[routedDayIndex];
    if (currentDay && optimizedOrderIndices && optimizedOrderIndices.length === currentDay.items.length - 2) {
      const start = currentDay.items[0];
      const end = currentDay.items[currentDay.items.length - 1];
      const waypoints = currentDay.items.slice(1, -1);
      
      const newWaypoints = optimizedOrderIndices.map(index => waypoints[index]);
      const optimizedItems = [start, ...newWaypoints, end];
      
      const isChanged = optimizedItems.some((item, i) => item.id !== currentDay.items[i].id);
      if (isChanged) {
        handleDayItemsChange(currentDay.id, optimizedItems);
      }
    }
  };

  const handleRouteCalculated = (legs) => {
    setRouteLegs(legs);
  };

  const routeMarkers = activeFolder.days[routedDayIndex]?.items || [];
  const routePlaceIds = new Set(routeMarkers.map(m => m.googlePlaceId || m.name));
  
  const storageAndOtherMarkers = [
    ...activeFolder.items,
    ...activeFolder.days.filter((_, idx) => idx !== routedDayIndex).flatMap(d => d.items)
  ].filter(m => !routePlaceIds.has(m.googlePlaceId || m.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {/* Top Section: Map + Search/Storage Split (Stacked on Mobile) */}
      <div className="split-layout">
        {/* Left Half: Map */}
        <div style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--color-border)' }}>
          <Map 
            storageMarkers={storageAndOtherMarkers} 
            routeMarkers={routeMarkers} 
            onRouteOptimized={handleRouteOptimized}
            onRouteCalculated={handleRouteCalculated}
            height="100%"
          />
        </div>

        {/* Right Half: Search & Storage */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto' }}>
          <PlaceSearch onAddPlace={handleAddPlace} storageItems={activeFolder.items} />
          
          <div style={{ marginTop: '8px' }}>
            <h2 style={{ fontSize: '15px', marginBottom: '8px', marginTop: 0, color: 'var(--color-text)', fontWeight: 'bold' }}>
              🗂️ 보관함
            </h2>
            <SortableTimeline 
              listId="보관함"
              items={activeFolder.items} 
              setItems={handleActiveFolderItemsChange} 
              groupName="schedule" 
              onDelete={handleDeletePlace}
              isCloneable={true}
              scheduledPlaceIds={activeFolder.days.flatMap(day => day.items.map(item => item.googlePlaceId || item.name))}
            />
          </div>
        </div>
      </div>

      {/* Bottom Section: Full Width Timeline */}
      <div style={{ 
        flex: 1, padding: '20px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg)'
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', background: 'var(--color-card)', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          
          {/* Day Tabs Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '15px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 'bold', marginRight: '10px', fontSize: '15px', color: 'var(--color-text)' }}>🗓️ 일자별 일정:</div>
            {activeFolder.days.map((day, index) => (
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
                {day.title}
              </button>
            ))}
            <button 
              onClick={handleAddDay}
              style={{
                padding: '10px 18px', borderRadius: '30px', border: '1px dashed var(--color-border)',
                background: 'transparent', color: 'var(--color-text-light)', cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              + Day 추가
            </button>
          </div>

          {/* Active Day Content */}
          {activeFolder.days[routedDayIndex] && (
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '22px', margin: 0, color: 'var(--color-text)', fontWeight: '800' }}>
                  📍 {activeFolder.days[routedDayIndex].title} 여행 경로
                </h2>
                <button 
                  onClick={() => handleDeleteDay(activeFolder.days[routedDayIndex].id)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #ff4d4f',
                    background: 'white', color: '#ff4d4f', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => { e.target.style.background = '#fff1f0'; }}
                  onMouseOut={(e) => { e.target.style.background = 'white'; }}
                >
                  Day 삭제
                </button>
              </div>
              
              <SortableTimeline 
                listId={activeFolder.days[routedDayIndex].title} 
                items={activeFolder.days[routedDayIndex].items} 
                setItems={(newItems) => handleDayItemsChange(activeFolder.days[routedDayIndex].id, newItems)} 
                groupName="schedule" 
                onDelete={handleDeletePlace}
                routeLegs={routeLegs}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Schedule;
