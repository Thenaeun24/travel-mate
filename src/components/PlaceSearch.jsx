import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

// URL 에서 장소 이름/주소(검색어)를 뽑는다. 좌표가 없을 때 쓴다.
//  - ?q=장소이름  (q 가 좌표가 아니라 이름/주소인 경우)
//  - /maps/place/이름
const extractPlaceQuery = (text) => {
  const qMatch = text.match(/[?&]q=([^&]+)/);
  if (qMatch) {
    let q = qMatch[1];
    try { q = decodeURIComponent(q.replace(/\+/g, ' ')); } catch { q = q.replace(/\+/g, ' '); }
    q = q.trim();
    // 좌표(위도,경도) 형태면 검색어가 아니다
    if (q && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q)) return q;
  }
  const placeMatch = text.match(/\/maps\/place\/([^/@?]+)/);
  if (placeMatch) {
    try { return decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim(); }
    catch { return placeMatch[1].replace(/\+/g, ' ').trim(); }
  }
  return null;
};

// 구글맵 URL(긴 주소 또는 펼쳐진 짧은 링크)에서 위치 정보를 뽑는다.
// 반환값:
//   { type: 'coords', name, lat, lng }  좌표를 찾은 경우
//   { type: 'query', query }            좌표는 없지만 장소 이름/주소가 있는 경우
//   null                                아무것도 못 찾은 경우
// 지원 좌표 형태: /maps/place/.../@위도,경도, data=..!3d위도!4d경도, q=/ll=/query=위도,경도
const parseGoogleMapsResult = (raw) => {
  if (!raw || typeof raw !== 'string') return null;

  // 구글이 봇으로 의심하면 /sorry(캡차)·consent 페이지로 감싼다.
  // 진짜 주소는 continue= 파라미터 안에 있으므로 꺼내서 사용한다.
  let text = raw;
  if (/google\.[^/]*\/sorry/i.test(raw) || /consent\.google/i.test(raw)) {
    const c = raw.match(/[?&]continue=([^&]+)/);
    if (c) {
      try { text = decodeURIComponent(c[1]); } catch { text = c[1]; }
    }
  }

  // 1) 좌표 찾기 (핀 좌표 !3d!4d → 지도중심 @위도,경도 → q=/ll= 위도,경도)
  const dataMatch = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const coordParam = text.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);

  let lat = null;
  let lng = null;
  if (dataMatch) {
    lat = parseFloat(dataMatch[1]);
    lng = parseFloat(dataMatch[2]);
  } else if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
  } else if (coordParam) {
    lat = parseFloat(coordParam[1]);
    lng = parseFloat(coordParam[2]);
  }

  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    let name = '';
    const placeMatch = text.match(/\/maps\/place\/([^/@?]+)/);
    if (placeMatch) {
      try { name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); }
      catch { name = placeMatch[1].replace(/\+/g, ' '); }
    }
    if (!name) name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return { type: 'coords', name, lat, lng };
  }

  // 2) 좌표가 없으면 장소 이름/주소를 검색어로 반환 (앱이 구글 검색으로 좌표를 찾는다)
  const query = extractPlaceQuery(text);
  if (query) return { type: 'query', query };

  return null;
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
// 펼친 URL 을 parseGoogleMapsResult 로 해석해 {type:'coords'|'query',...} 또는 null 을 반환한다.
const resolveShortLink = async (shortUrl) => {
  // 1순위: 자체 Worker
  const workerUrl = import.meta.env.VITE_LINK_RESOLVER_URL;
  if (workerUrl) {
    try {
      const res = await fetchWithTimeout(`${workerUrl}?u=${encodeURIComponent(shortUrl)}`);
      if (res.ok) {
        const data = await res.json();
        const parsed = data?.finalUrl ? parseGoogleMapsResult(data.finalUrl) : null;
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
    let parsed = data?.status?.url ? parseGoogleMapsResult(data.status.url) : null;
    if (!parsed && data?.contents) parsed = parseGoogleMapsResult(data.contents);
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
  const addPlaceFromCoords = ({ name, lat, lng, googlePlaceId = null }) => {
    const newPlace = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      googlePlaceId,
      name,
      category: selectedCategory,
      lat,
      lng
    };
    onAddPlace(newPlace);
    setInputValue('');
    setSearchResults([]);
  };

  // 검색어(장소 이름/주소)로 구글 Places 검색을 해서 후보 목록을 보여준다.
  // 이름/주소 검색은 1등이 엉뚱할 수 있어, 자동 추가하지 않고 사용자가 직접 고른다.
  const runTextSearch = async (query) => {
    setIsSearching(true);
    try {
      // Use Places API (New) instead of Legacy PlacesService
      const { Place } = await window.google.maps.importLibrary("places");
      const { places } = await Place.searchByText({
        textQuery: query,
        fields: ["id", "displayName", "location", "formattedAddress"],
        maxResultCount: 5,
      });

      setIsSearching(false);
      setInputValue('');
      if (places && places.length > 0) {
        setSearchResults(places);
      } else {
        alert("검색 결과가 없습니다. 다른 검색어를 입력하거나 구글맵의 긴 주소를 붙여넣어 주세요.");
      }
    } catch (error) {
      setIsSearching(false);
      alert("검색 중 오류가 발생했습니다. 구글맵 API 설정을 확인해주세요.");
      console.error("Places API Error:", error);
    }
  };

  // 링크에서 뽑은 "이름+주소" 로 위치를 찾는다.
  //  - 이름이 건물명/호수라 이름 검색은 실패하기 쉬우므로, 주소를 좌표로 바꾸는
  //    Geocoding 결과를 최우선 후보로 넣고, 이름 기반 Places 결과도 함께 보여준다.
  //  - 자동 추가하지 않고 후보 목록에서 사용자가 정확한 곳을 고른다.
  const addFromQuery = async (query) => {
    setIsSearching(true);
    const candidates = [];

    // 1) 주소 → 정확 좌표 (Geocoder). 결과 형태를 Places 후보와 맞춰 담는다.
    try {
      const { Geocoder } = await window.google.maps.importLibrary("geocoding");
      const { results } = await new Geocoder().geocode({ address: query });
      if (results && results.length > 0) {
        const r = results[0];
        candidates.push({
          displayName: query.split(',')[0].trim() || r.formatted_address,
          formattedAddress: r.formatted_address,
          id: r.place_id,
          location: r.geometry.location, // .lat()/.lng() 제공 → Places 후보와 동일
        });
      }
    } catch (err) {
      console.error("Geocoder error", err);
    }

    // 2) 이름 기반 후보 (Places)
    try {
      const { Place } = await window.google.maps.importLibrary("places");
      const { places } = await Place.searchByText({
        textQuery: query,
        fields: ["id", "displayName", "location", "formattedAddress"],
        maxResultCount: 5,
      });
      if (places) candidates.push(...places);
    } catch (err) {
      console.error("Places API Error", err);
    }

    setIsSearching(false);
    setInputValue('');
    if (candidates.length > 0) {
      setSearchResults(candidates);
    } else {
      alert("링크에서 위치를 찾지 못했습니다. 구글맵의 긴 주소를 붙여넣거나 장소 이름으로 검색해주세요.");
    }
  };

  const handlePasteOrEnter = async (e) => {
    // 붙여넣기(paste) 시점에는 input 값이 아직 갱신되지 않으므로 clipboard 에서 직접 읽는다.
    const val = e.type === 'paste'
      ? (e.clipboardData?.getData('text') ?? e.target.value)
      : e.target.value;

    if (e.type !== 'paste' && e.key !== 'Enter') return;

    // 1) 긴 주소(전체 URL)이면 바로 해석
    const parsed = parseGoogleMapsResult(val);
    if (parsed) {
      e.preventDefault();
      if (parsed.type === 'coords') addPlaceFromCoords(parsed);
      else await addFromQuery(parsed.query); // 좌표 없이 이름/주소만 → 주소 좌표변환+검색 후보
      return;
    }

    // 2) 짧은 링크 등 그 밖의 URL 이면 펼쳐서 해석
    if (val.includes('http')) {
      e.preventDefault();
      setIsSearching(true);
      const resolved = await resolveShortLink(val.trim());
      if (resolved && resolved.type === 'coords') {
        setIsSearching(false);
        addPlaceFromCoords(resolved);
      } else if (resolved && resolved.type === 'query') {
        // 좌표가 없으면 링크에서 뽑은 주소를 좌표로 변환 + 이름 검색 → 후보에서 고르기
        await addFromQuery(resolved.query);
      } else {
        setIsSearching(false);
        alert("링크에서 위치를 찾지 못했습니다. 구글맵의 긴 주소를 붙여넣거나 장소 이름으로 검색해주세요.");
        setInputValue('');
      }
      return;
    }

    // 3) 일반 텍스트면 장소 이름으로 검색 (후보 목록 표시)
    if (e.key === 'Enter' && val.trim() !== '') {
      e.preventDefault();
      await runTextSearch(val.trim());
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
              검색 결과 — 맞는 장소를 눌러서 추가하세요
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
