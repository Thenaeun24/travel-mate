import React, { useState } from 'react';

// Google Places autocomplete + text search are disabled while we sort out
// the billing issue. This component is a pure manual entry form. The Google
// Maps URL paste path is kept because it's plain regex parsing and never
// hits the API. "lat,lng" plain-coord input is also accepted.
const PlaceSearch = ({ onAddPlace }) => {
  const [name, setName] = useState('');
  const [coords, setCoords] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('관광명소');

  // Returns { name?, lat, lng } or null if the input doesn't look like coords.
  const parseCoords = (input) => {
    const urlMatch = input.match(/google\..*\/maps\/place\/([^/]+)\/@([\d.-]+),([\d.-]+)/i);
    if (urlMatch) {
      return {
        name: decodeURIComponent(urlMatch[1].replace(/\+/g, ' ')),
        lat: parseFloat(urlMatch[2]),
        lng: parseFloat(urlMatch[3])
      };
    }
    const coordMatch = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
    }
    return null;
  };

  const handleAdd = () => {
    const trimmedName = name.trim();
    const trimmedCoords = coords.trim();

    let finalName = trimmedName;
    let lat = null;
    let lng = null;

    if (trimmedCoords) {
      const parsed = parseCoords(trimmedCoords);
      if (!parsed) {
        alert('좌표는 "위도,경도" 또는 구글맵 긴 주소(/maps/place/.../@위도,경도) 형식으로 입력해주세요.');
        return;
      }
      lat = parsed.lat;
      lng = parsed.lng;
      if (!finalName && parsed.name) finalName = parsed.name;
    }

    if (!finalName) {
      alert('장소 이름을 입력해주세요.');
      return;
    }

    onAddPlace({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      googlePlaceId: null,
      name: finalName,
      category: selectedCategory,
      lat,
      lng
    });
    setName('');
    setCoords('');
  };

  const onEnter = (handler) => (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handler();
    }
  };

  return (
    <div className="card" style={{ margin: '0 0 16px 0', padding: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)' }}>
          장소 추가 (Google 검색 일시 비활성화 — 직접 입력)
        </label>

        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none' }}
          >
            <option value="관광명소">관광명소</option>
            <option value="맛집">맛집</option>
            <option value="카페">카페</option>
            <option value="숙소">숙소</option>
            <option value="기타">기타</option>
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter(handleAdd)}
            placeholder="장소 이름"
            style={{
              padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)',
              fontSize: '14px', flex: 1, outline: 'none'
            }}
          />
        </div>

        <input
          type="text"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          onKeyDown={onEnter(handleAdd)}
          placeholder="(선택) 위도,경도  또는  구글맵 긴 주소 붙여넣기"
          style={{
            padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)',
            fontSize: '14px', outline: 'none'
          }}
        />

        <button
          onClick={handleAdd}
          style={{
            padding: '10px', borderRadius: '6px', border: 'none',
            background: 'var(--color-point)', color: 'white',
            fontSize: '14px', fontWeight: 'bold', cursor: 'pointer'
          }}
        >
          + 추가
        </button>

        <div style={{ fontSize: '11px', color: 'var(--color-text-light)', lineHeight: 1.5 }}>
          팁: 구글맵에서 장소 페이지의 긴 주소(<code>/maps/place/.../@…</code>)를 그대로 붙여넣으면 이름과 좌표가 자동 입력됩니다.
          짧은 공유 링크(maps.app.goo.gl)는 좌표를 추출할 수 없으니 긴 주소를 사용해주세요.
        </div>
      </div>
    </div>
  );
};

export default PlaceSearch;
