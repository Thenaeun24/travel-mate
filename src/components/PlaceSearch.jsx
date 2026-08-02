import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

// 구글맵 "긴 주소"(전체 URL)에서 장소 이름과 좌표를 뽑아낸다.
// 다양한 형태를 지원한다:
//  - .../maps/place/이름/@위도,경도...
//  - data=...!3d위도!4d경도  (핀의 정확한 좌표)
//  - ?q=위도,경도 / &ll=위도,경도 / &query=위도,경도
// 좌표를 못 찾으면 null 을 반환한다.
const parseGoogleMapsUrl = (text) => {
  if (!text || typeof text !== 'string') return null;

  let lat = null;
  let lng = null;

  // 1) 핀의 정확한 좌표(!3d!4d)를 최우선으로 사용
  const dataMatch = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  // 2) 없으면 지도 중심 좌표(@위도,경도)
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  // 3) 그래도 없으면 q=/ll=/query=/destination= 파라미터
  const paramMatch = text.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);

  if (dataMatch) {
    lat = parseFloat(dataMatch[1]);
    lng = parseFloat(dataMatch[2]);
  } else if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
  } else if (paramMatch) {
    lat = parseFloat(paramMatch[1]);
    lng = parseFloat(paramMatch[2]);
  }

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  // 장소 이름: /maps/place/이름/ 에서 추출 (없으면 좌표로 대체)
  let name = '';
  const placeMatch = text.match(/\/maps\/place\/([^/@?]+)/);
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ');
    }
  }
  if (!name) name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return { name, lat, lng };
};

// 타임아웃이 걸린 fetch (기본 10초). 시간 초과 시 abort 된다.
const fetchWithTimeout = async (url, ms = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

// 짧은 링크(maps.app.goo.gl 등)는 좌표가 숨겨진 리다이렉트 링크다.
// 이 앱은 백엔드가 없는 정적 사이트라서 리다이렉트를 직접 펼칠 수 없다.
//  1순위: 자체 Cloudflare Worker (VITE_LINK_RESOLVER_URL). {finalUrl} 을 돌려준다.
//  2순위(폴백): 공용 CORS 프록시(allorigins). Worker 미설정/실패 시에만 사용.
// 최종 URL 에서 좌표를 뽑아 반환하고, 못 찾으면 null 을 반환한다.
const resolveShortLink = async (shortUrl) => {
  // 1순위: 자체 Worker
  const workerUrl = import.meta.env.VITE_LINK_RESOLVER_URL;
  if (workerUrl) {
    try {
      const res = await fetchWithTimeout(`${workerUrl}?u=${encodeURIComponent(shortUrl)}`);
      if (res.ok) {
        const data = await res.json();
        const parsed = data?.finalUrl ? parseGoogleMapsUrl(data.finalUrl) : null;
        if (parsed) return parsed;
      }
    } catch {
      // Worker 실패 시 아래 폴백으로 진행
    }
  }

  // 2순위(폴백): 공용 CORS 프록시
  try {
    const proxy = 'https://api.allorigins.win/get?url=';
    const res = await fetchWithTimeout(proxy + encodeURIComponent(shortUrl));
    if (!res.ok) return null;
    const data = await res.json();

    // 리다이렉트 후 최종 URL 에서 먼저 시도, 없으면 페이지 본문(HTML)을 스캔
    let parsed = data?.status?.url ? parseGoogleMapsUrl(data.status.url) : null;
    if (!parsed && data?.contents) parsed = parseGoogleMapsUrl(data.contents);
    return parsed;
  } catch {
    return null;
  }
};

const PlaceSearch = ({ onAddPlace, storageItems = [] }) => {
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('관광명소');
  const [autocomplete, setAutocomplete] = useState(null);
  const [searchResults, setSearchResults] = useState([]); // State for candidates
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const initAutocomplete = async () => {
      const loader = new Loader({
        apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
        version: "weekly",
        libraries: ["places"]
      });

      try {
        await loader.importLibrary("places");
        if (inputRef.current) {
          const autocompleteInstance = new window.google.maps.places.Autocomplete(inputRef.current, {
            fields: ["place_id", "name", "geometry"],
          });

          autocompleteInstance.addListener("place_changed", () => {
            const place = autocompleteInstance.getPlace();
            if (place.geometry && place.geometry.location) {
              const newPlace = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                googlePlaceId: place.place_id,
                name: place.name,
                category: selectedCategory,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
              };
              onAddPlace(newPlace);
              setInputValue(''); 
              setSearchResults([]);
            }
          });
          setAutocomplete(autocompleteInstance);
        }
      } catch (e) {
        console.error("Autocomplete load error", e);
      }
    };

    initAutocomplete();
  }, [onAddPlace, selectedCategory]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (searchResults.length > 0) setSearchResults([]); // clear results if user types again
  };

  // 좌표 정보로 장소를 추가하는 공통 함수
  const addPlaceFromCoords = ({ name, lat, lng }) => {
    const newPlace = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      googlePlaceId: null,
      name,
      category: selectedCategory,
      lat,
      lng
    };
    onAddPlace(newPlace);
    setInputValue('');
    setSearchResults([]);
  };

  const handlePasteOrEnter = async (e) => {
    // 붙여넣기(paste) 시점에는 input 값이 아직 갱신되지 않으므로 clipboard 에서 직접 읽는다.
    const val = e.type === 'paste'
      ? (e.clipboardData?.getData('text') ?? e.target.value)
      : e.target.value;

    if (e.type !== 'paste' && e.key !== 'Enter') return;

    // 1) 긴 주소(전체 URL)이면 바로 파싱해서 추가
    const parsed = parseGoogleMapsUrl(val);
    if (parsed) {
      e.preventDefault();
      addPlaceFromCoords(parsed);
      return;
    }

    // 2) 짧은 링크 등 그 밖의 URL 이면 프록시로 펼쳐서 좌표를 뽑는다
    if (val.includes('http')) {
      e.preventDefault();
      setIsSearching(true);
      const resolved = await resolveShortLink(val.trim());
      setIsSearching(false);
      if (resolved) {
        addPlaceFromCoords(resolved);
      } else {
        alert("링크에서 위치를 찾지 못했습니다. 구글맵의 긴 주소를 붙여넣거나 장소 이름으로 검색해주세요.");
        setInputValue('');
      }
      return;
    }

    // 3) 일반 텍스트면 장소 이름으로 검색
    if (e.key === 'Enter') {
      if (val.trim() !== '') {
        e.preventDefault();
        setIsSearching(true);

        try {
          // Use Places API (New) instead of Legacy PlacesService
          const { Place } = await window.google.maps.importLibrary("places");
          const request = {
            textQuery: val,
            fields: ["id", "displayName", "location", "formattedAddress"],
            maxResultCount: 5,
          };
          
          const { places } = await Place.searchByText(request);
          
          setIsSearching(false);
          if (places && places.length > 0) {
            setSearchResults(places);
          } else {
            alert("검색 결과가 없습니다. 다른 검색어를 입력해보세요.");
          }
        } catch (error) {
          setIsSearching(false);
          alert("검색 중 오류가 발생했습니다. 구글맵 API 설정을 확인해주세요.");
          console.error("Places API Error:", error);
        }
      }
    }
  };

  const handleSelectCandidate = (place) => {
    if (place.location) {
      const newPlace = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        googlePlaceId: place.id,
        name: place.displayName,
        category: selectedCategory,
        lat: place.location.lat(),
        lng: place.location.lng()
      };
      onAddPlace(newPlace);
      setInputValue('');
      setSearchResults([]);
    }
  };

  return (
    <div className="card" style={{ margin: '0 0 16px 0', padding: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-light)' }}>
          장소 검색 또는 구글맵 링크 붙여넣기 (긴 주소 · 짧은 링크 모두 가능)
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
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') handlePasteOrEnter(e);
            }}
            onPaste={handlePasteOrEnter}
            placeholder={isSearching ? "링크 분석 중..." : "예: 파리 에펠탑, 또는 구글맵 링크 붙여넣기"}
            disabled={isSearching}
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              fontSize: '14px',
              flex: 1,
              outline: 'none',
              background: isSearching ? '#f0f0f0' : 'white'
            }}
          />
        </div>

        {searchResults.length > 0 && (
          <div style={{
            marginTop: '8px',
            border: '1px solid var(--color-point)',
            borderRadius: '8px',
            background: 'white',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{ padding: '8px 12px', background: 'var(--color-bg)', fontSize: '12px', fontWeight: 'bold', color: 'var(--color-point)' }}>
              엔터 검색 결과 (클릭하여 추가)
            </div>
            {searchResults.map((place, index) => {
              const isInStorage = storageItems.some(item => item.googlePlaceId === place.id);
              return (
                <div 
                  key={place.id || index}
                  onClick={() => handleSelectCandidate(place)}
                  style={{
                    padding: '12px',
                    borderBottom: index === searchResults.length - 1 ? 'none' : '1px solid var(--color-border)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      {place.displayName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-light)' }}>
                      {place.formattedAddress}
                    </div>
                  </div>
                  {isInStorage && (
                    <div style={{ color: 'var(--color-point)', fontWeight: 'bold', fontSize: '14px', marginLeft: '8px' }}>
                      ✓ 보관됨
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaceSearch;
