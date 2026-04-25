import React from 'react';

// Google Maps integration is disabled while we sort out the billing issue.
// This component keeps the same props/shape as before so the rest of the app
// (Schedule, route legs, marker filtering) works without changes — it just
// renders an informational placeholder instead of loading the Maps SDK.
const Map = ({ storageMarkers = [], routeMarkers = [], height }) => {
  return (
    <div
      style={{
        width: '100%',
        height: height || '35vh',
        backgroundColor: 'var(--color-bg)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '20px',
        textAlign: 'center',
        border: '1px dashed var(--color-border)'
      }}
    >
      <div style={{ fontSize: '38px', lineHeight: 1 }}>🗺️</div>
      <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--color-text)' }}>
        지도 기능 일시 중단
      </div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-light)', maxWidth: '420px', lineHeight: 1.5 }}>
        Google Maps 비용 이슈로 잠시 비활성화 했어요.<br />
        장소 추가 / 일정 정리 / 순서 변경은 그대로 사용 가능합니다.
      </div>
      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-light)' }}>
        오늘 일정 <b>{routeMarkers.length}</b>곳 · 보관함 <b>{storageMarkers.length}</b>곳
      </div>
    </div>
  );
};

export default Map;
