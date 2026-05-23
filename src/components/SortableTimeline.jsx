import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ReactSortable } from 'react-sortablejs';

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

const SortableTimeline = ({ listId, items, setItems, groupName, onDelete, routeLegs = [], isCloneable = false, scheduledPlaceIds = [], onLongPressItem, days = [] }) => {
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [dayPickerItem, setDayPickerItem] = useState(null);
  const [dayPickerPos, setDayPickerPos] = useState({ x: 0, y: 0 });
  const isMobile = useIsMobile();

  // ── Long press logic (mobile only) ────────────────────────────────────────
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const startLongPress = useCallback((item, e) => {
    if (!isCloneable || !isMobile) return;
    longPressTriggered.current = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartPos.current = { x: clientX, y: clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setDayPickerItem(item);
      setDayPickerPos({ x: clientX, y: clientY });
    }, 500);
  }, [isCloneable, isMobile]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // 드래그 중이면 롱프레스 취소 (10px 이상 움직이면 드래그로 판단)
  const handleTouchMove = useCallback((e) => {
    if (!longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const handleCardClick = useCallback((item, e) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    toggleExpand(item.id, e);
  }, []);

  const handleDaySelect = (day) => {
    if (onLongPressItem && dayPickerItem) {
      onLongPressItem(dayPickerItem, day);
    }
    setDayPickerItem(null);
  };

  const getCategoryColor = (category) => {
    if (!category) return 'bg-green';
    if (category.includes('관광') || category.includes('명소')) return 'bg-blue';
    if (category.includes('맛집') || category.includes('식당') || category.includes('음식')) return 'bg-pink';
    if (category.includes('카페') || category.includes('디저트')) return 'bg-yellow';
    return 'bg-green';
  };

  const updateItem = (id, field, value) => {
    const newItems = items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    setItems(newItems);
  };

  const toggleExpand = (id, e) => {
    // Prevent toggle if clicking on input, select, textarea, or button
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
      return;
    }
    setExpandedItemId(prev => prev === id ? null : id);
  };

  // ── Day picker overlay ──────────────────────────────────────────────────
  const DayPickerOverlay = () => {
    if (!dayPickerItem) return null;
    // Position the popup near the touch point but keep it on screen
    const popupW = 200;
    const popupMaxH = 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = dayPickerPos.x - popupW / 2;
    let top = dayPickerPos.y + 12;
    if (left < 8) left = 8;
    if (left + popupW > vw - 8) left = vw - popupW - 8;
    if (top + popupMaxH > vh - 8) top = dayPickerPos.y - popupMaxH - 12;

    return (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setDayPickerItem(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.25)',
          }}
        />
        {/* Popup */}
        <div style={{
          position: 'fixed',
          left, top,
          width: popupW,
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
          zIndex: 9001,
          overflow: 'hidden',
          animation: 'fadeInUp 0.18s ease',
        }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>📍 {dayPickerItem.name}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>어느 날에 추가할까요?</div>
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {days.length > 0 ? days.map((day, idx) => (
              <button
                key={day.id}
                onClick={() => handleDaySelect(day)}
                style={{
                  display: 'block', width: '100%', padding: '12px 16px',
                  border: 'none', background: 'none', textAlign: 'left',
                  fontSize: '14px', cursor: 'pointer', color: '#333',
                  borderBottom: idx < days.length - 1 ? '1px solid #f5f5f5' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f4ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                📅 {day.title || `Day ${idx + 1}`}
              </button>
            )) : (
              <div style={{ padding: '16px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>등록된 Day가 없어요</div>
            )}
          </div>
          <button
            onClick={() => setDayPickerItem(null)}
            style={{
              display: 'block', width: '100%', padding: '12px',
              border: 'none', borderTop: '1px solid #f0f0f0',
              background: '#fafafa', color: '#999', fontSize: '13px',
              cursor: 'pointer', fontWeight: 'bold',
            }}
          >
            취소
          </button>
        </div>
      </>
    );
  };

  return (
    <div
      className="timeline-container"
      style={{
        minHeight: '100px', 
        padding: '10px', 
        background: 'var(--color-bg)', 
        borderRadius: '8px',
        border: '1px dashed var(--color-border)'
      }}
    >
      <DayPickerOverlay />
      <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--color-text-light)' }}>{listId}</h3>
      <ReactSortable
        list={items}
        setList={(newList) => {
          // ReactSortable calls setList on mount and on every render.
          // Only propagate if the list actually changed (different IDs or order).
          const oldIds = items.map((i) => i.id).join(',');
          const newIds = newList.map((i) => i.id).join(',');
          if (oldIds !== newIds) {
            setItems(newList);
          }
        }}
        group={isCloneable ? { name: groupName, pull: 'clone', put: false } : groupName}
        clone={isCloneable ? (item) => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) }) : undefined}
        animation={150}
        scroll={true}
        scrollSensitivity={50}
        ghostClass="sortable-ghost"
        filter="textarea, input, select"
        preventOnFilter={false}
        style={{ minHeight: '80px' }}
      >
        {items.map((item, index) => {
          const isRoute = listId.includes('Day');
          const alphabet = isRoute ? String.fromCharCode(65 + index) : null;
          const isExpanded = expandedItemId === item.id;
          const isScheduled = isCloneable && scheduledPlaceIds.includes(item.googlePlaceId || item.name);
          
          return (
          <div key={item.id} className="sortable-item" style={{ position: 'relative' }}>
            <div 
              className="card"
              style={{ margin: '8px 0', cursor: 'grab', padding: '0', overflow: 'hidden', position: 'relative', zIndex: 1 }}
              onClick={(e) => handleCardClick(item, e)}
              onMouseDown={(e) => { if (isMobile) startLongPress(item, e); }}
              onMouseUp={() => { if (isMobile) cancelLongPress(); }}
              onMouseLeave={() => { if (isMobile) cancelLongPress(); }}
              onTouchStart={(e) => startLongPress(item, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onContextMenu={(e) => { if (isCloneable && isMobile) e.preventDefault(); }}
            >
              {/* Header section */}
              <div style={{ padding: '12px', display: 'flex', alignItems: 'center' }}>
                {isRoute && (
                  <div style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    backgroundColor: '#EA4335', color: 'white', 
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    fontWeight: 'bold', fontSize: '12px', marginRight: '12px', flexShrink: 0
                  }}>
                    {alphabet}
                  </div>
                )}
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`card-category-badge ${getCategoryColor(item.category)}`}>
                      {item.category || '기타'}
                    </div>
                    {isRoute && (
                      <input 
                        type="time" 
                        value={item.time || ''}
                        onChange={(e) => updateItem(item.id, 'time', e.target.value)}
                        style={{ 
                          border: 'none', background: 'var(--color-bg)', borderRadius: '4px',
                          padding: '2px 4px', fontSize: '12px', color: 'var(--color-text)'
                        }}
                      />
                    )}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.name}
                    {isScheduled && <span style={{ fontSize: '10px', color: 'var(--color-point)', background: '#fff0f6', padding: '2px 6px', borderRadius: '10px', whiteSpace: 'nowrap' }}>✓ 일정 추가됨</span>}
                  </div>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px', fontSize: '16px', color: 'var(--color-text-light)'
                  }}
                >
                  🗑️
                </button>
              </div>

              {/* Expanded Accordion section */}
              {isExpanded && (
                <div style={{ padding: '12px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  
                  {/* Category Selection */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)', width: '60px' }}>카테고리</span>
                    <select 
                      value={item.category || '관광명소'} 
                      onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12px', flex: 1 }}
                    >
                      <option value="관광명소">관광명소</option>
                      <option value="맛집">맛집</option>
                      <option value="카페">카페</option>
                      <option value="숙소">숙소</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>

                  {/* Budget */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)', width: '60px' }}>예산(현지)</span>
                    <input 
                      type="number" 
                      placeholder="금액 입력"
                      value={item.budget || ''}
                      onChange={(e) => updateItem(item.id, 'budget', e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12px', flex: 1 }}
                    />
                    {item.budget && (
                      <span style={{ fontSize: '11px', color: 'var(--color-point)', width: '60px', textAlign: 'right' }}>
                        ≒ {(item.budget * 9.0).toLocaleString()}원
                      </span>
                    )}
                  </div>

                  {/* Transport */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)', width: '60px' }}>다음 이동수단</span>
                    <select 
                      value={item.transport || ''} 
                      onChange={(e) => updateItem(item.id, 'transport', e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12px', flex: 1 }}
                    >
                      <option value="">구글맵 기본 (도보)</option>
                      <option value="도보">🚶 도보</option>
                      <option value="지하철">🚇 지하철</option>
                      <option value="버스">🚌 버스</option>
                      <option value="택시">🚕 택시</option>
                    </select>
                  </div>

                  {/* Custom Transit Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)', width: '60px' }}>다음 소요시간</span>
                    <input 
                      type="text" 
                      placeholder="예: 30분 (입력 시 구글맵 시간 덮어씀)"
                      value={item.customTransitTime || ''}
                      onChange={(e) => updateItem(item.id, 'customTransitTime', e.target.value)}
                      style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12px', flex: 1 }}
                    />
                  </div>

                  {/* Memo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)' }}>상세 메모</span>
                    <textarea 
                      placeholder="주문 메뉴, 예약 번호 등 기록..."
                      value={item.memo || ''}
                      onChange={(e) => updateItem(item.id, 'memo', e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12px', resize: 'vertical', minHeight: '150px', fontFamily: 'inherit' }}
                    />
                  </div>
                  
                  {/* Google Maps Link */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <a 
                      href={item.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${item.googlePlaceId}` : `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        fontSize: '12px', padding: '6px 12px', borderRadius: '20px', 
                        background: '#4285F4', color: 'white', textDecoration: 'none', fontWeight: 'bold',
                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      🌍 구글맵에서 보기
                    </a>
                  </div>

                </div>
              )}
            </div>
            
            {/* Travel time indicator between cards */}
            {isRoute && routeLegs && routeLegs[index] && index < items.length - 1 && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '-4px 0',
                position: 'relative',
                zIndex: 0
              }}>
                <div style={{ 
                  background: 'var(--color-bg)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: '12px', 
                  padding: '2px 8px', 
                  fontSize: '11px', 
                  color: 'var(--color-text-light)',
                  display: 'flex',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  <span>
                    {{
                      '도보': '🚶',
                      '지하철': '🚇',
                      '버스': '🚌',
                      '택시': '🚕'
                    }[item.transport] || '🚶'} {item.customTransitTime || routeLegs[index].duration?.text}
                  </span>
                  <span style={{ color: 'var(--color-border)' }}>|</span>
                  <span>{routeLegs[index].distance?.text}</span>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </ReactSortable>
    </div>
  );
};

export default SortableTimeline;
