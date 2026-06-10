import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

// 장소 이름이 그대로 HTML로 들어가지 않도록 이스케이프한다.
const escapeHtml = (str) =>
  String(str || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

// 카테고리별 마커 색상 + 이모지. 보관함/다른 날 장소를 지도에서 한눈에 구분하기 위함.
const categoryPin = (category) => {
  const c = category || '';
  if (c.includes('관광') || c.includes('명소')) return { color: '#4285F4', emoji: '📷' };
  if (c.includes('맛집') || c.includes('식당') || c.includes('음식')) return { color: '#EA4335', emoji: '🍴' };
  if (c.includes('카페') || c.includes('디저트')) return { color: '#F9AB00', emoji: '☕' };
  if (c.includes('숙소') || c.includes('호텔')) return { color: '#9334E6', emoji: '🏨' };
  return { color: '#34A853', emoji: '📍' };
};

// 카테고리 색상 물방울 핀 + 이모지를 그린 SVG data URL을 만든다.
const buildPinSvgUrl = (color, emoji) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">` +
    `<path d="M20 1C10 1 2 9 2 19c0 13 18 27 18 27s18-14 18-27C38 9 30 1 20 1z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<circle cx="20" cy="19" r="12" fill="#fff"/>` +
    `<text x="20" y="24" font-size="15" text-anchor="middle">${emoji}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};

const Map = ({ storageMarkers = [], routeMarkers = [], onRouteCalculated, height }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const directionsServiceRef = useRef(null);
  // 구간(leg)별로 교통수단이 다를 수 있어 구간마다 별도의 Renderer를 쓴다.
  const segmentRenderersRef = useRef([]);
  const routePointMarkersRef = useRef([]);
  const markersRef = useRef([]);
  // 마커를 누르면 이름을 띄우는 공용 InfoWindow.
  const infoWindowRef = useRef(null);
  // 같은 (출발·도착·이동수단) 구간은 결과를 캐싱해 불필요한 Directions API 호출을 막는다.
  // 이동수단을 바꿔도 실제로 바뀐 구간만 새로 호출된다.
  const legCacheRef = useRef(new window.Map());

  useEffect(() => {
    const initMap = async () => {
      const loader = new Loader({
        apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", // Use API Key from env
        version: "weekly",
        libraries: ["places", "routes"]
      });

      try {
        const { Map: GoogleMap } = await loader.importLibrary("maps");
        await loader.importLibrary("routes");

        const mapInstance = new GoogleMap(mapRef.current, {
          center: { lat: 38.7223, lng: -9.1393 }, // Lisbon default
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          scrollwheel: true,
          gestureHandling: 'greedy',
        });

        directionsServiceRef.current = new window.google.maps.DirectionsService();
        infoWindowRef.current = new window.google.maps.InfoWindow();

        setMap(mapInstance);
      } catch (e) {
        console.error("Map load error", e);
      }
    };

    initMap();
  }, []);

  // Track marker count to fit bounds only when needed
  const lastMarkerCountRef = useRef(0);
  // Coord signature guards prevent re-creating markers / re-calling Directions API
  // when parent re-renders with a new array reference but identical coordinates.
  const lastStorageSignatureRef = useRef('');
  const lastRouteSignatureRef = useRef('');

  // Effect to handle storage markers
  useEffect(() => {
    if (!map || !window.google) return;

    const storageSignature = storageMarkers
      .map(p => `${p.lat},${p.lng},${p.name || ''},${p.category || ''}`)
      .join('|');
    if (storageSignature === lastStorageSignatureRef.current) return;
    lastStorageSignatureRef.current = storageSignature;

    // Clear old storage markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    storageMarkers.forEach(place => {
      if (place.lat && place.lng) {
        const position = { lat: place.lat, lng: place.lng };
        const { color, emoji } = categoryPin(place.category);
        const marker = new window.google.maps.Marker({
          position,
          map,
          title: place.name,
          icon: {
            url: buildPinSvgUrl(color, emoji),
            scaledSize: new window.google.maps.Size(34, 41),
            anchor: new window.google.maps.Point(17, 41),
          },
        });
        marker.addListener('click', () => {
          infoWindowRef.current.setContent(
            `<div style="font-size:13px;font-weight:600;color:#333;padding:2px 4px;">${emoji} ${escapeHtml(place.name)}</div>`
          );
          infoWindowRef.current.open({ map, anchor: marker });
        });
        markersRef.current.push(marker);
        bounds.extend(position);
      }
    });

    // Auto-fit storage markers only if no route and markers count changed
    if (storageMarkers.length > 0 && routeMarkers.length === 0 && storageMarkers.length !== lastMarkerCountRef.current) {
      map.fitBounds(bounds);
      lastMarkerCountRef.current = storageMarkers.length;
    }
  }, [map, storageMarkers, routeMarkers.length]);

  // Effect to handle routing
  useEffect(() => {
    if (!map || !window.google || !directionsServiceRef.current) return;

    // 교통수단(transport)이 바뀌면 소요시간도 다시 계산해야 하므로 시그니처에 포함한다.
    const routeSignature = routeMarkers
      .map(p => `${p.lat},${p.lng},${p.transport || ''}`)
      .join('|');
    if (routeSignature === lastRouteSignatureRef.current) return;
    lastRouteSignatureRef.current = routeSignature;

    const clearRoute = () => {
      segmentRenderersRef.current.forEach(r => r.setMap(null));
      segmentRenderersRef.current = [];
      routePointMarkersRef.current.forEach(m => m.setMap(null));
      routePointMarkersRef.current = [];
    };

    // 일정에서 고른 이동수단 → Google Directions 요청 후보들(우선순위 순).
    // 앞 후보가 결과가 없으면(ZERO_RESULTS 등) 다음 후보로 폴백한다.
    // 대중교통(TRANSIT)의 leg.duration은 구글맵처럼 "정류장까지 도보 + 대중교통"을
    // 모두 합친 문 앞~문 앞 총 소요시간이다. 대중교통 데이터가 아예 없는 지역에서는
    // 마지막에 거리 기반 추정치(estimateAs)로 도보와 다른 시간을 보여준다.
    const requestChainFor = (transport) => {
      const g = window.google.maps;
      switch (transport) {
        case '버스':
          return [
            { request: { travelMode: g.TravelMode.TRANSIT, transitOptions: { modes: [g.TransitMode.BUS] } } },
            { request: { travelMode: g.TravelMode.TRANSIT } }, // 도보+대중교통 종합 경로
            { request: { travelMode: g.TravelMode.DRIVING }, estimateAs: '버스' }, // 데이터 없으면 거리 기반 추정
            { request: { travelMode: g.TravelMode.WALKING }, estimateAs: '버스' },
          ];
        case '지하철':
          return [
            { request: { travelMode: g.TravelMode.TRANSIT, transitOptions: { modes: [g.TransitMode.SUBWAY] } } },
            { request: { travelMode: g.TravelMode.TRANSIT } },
            { request: { travelMode: g.TravelMode.DRIVING }, estimateAs: '지하철' },
            { request: { travelMode: g.TravelMode.WALKING }, estimateAs: '지하철' },
          ];
        case '택시':
          return [
            { request: { travelMode: g.TravelMode.DRIVING } },
            { request: { travelMode: g.TravelMode.WALKING } },
          ];
        case '도보':
        default:
          return [{ request: { travelMode: g.TravelMode.WALKING } }];
      }
    };

    // ── 표시용 포맷터 ─────────────────────────────────────────────────────────
    const fmtDur = (sec) => {
      const m = Math.max(1, Math.round(sec / 60));
      if (m < 60) return `${m}분`;
      const h = Math.floor(m / 60);
      const r = m % 60;
      return r ? `${h}시간 ${r}분` : `${h}시간`;
    };
    const fmtDist = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

    // 대중교통 실데이터가 없을 때 이동거리 기반으로 소요시간(초)을 추정한다.
    const TRANSIT_SPEED_MPS = { '버스': 5.0, '지하철': 9.0 };   // ~18km/h, ~32km/h
    const TRANSIT_OVERHEAD_SEC = { '버스': 300, '지하철': 360 }; // 대기·환승·접근 시간
    const estimatedSeconds = (meters, transport) => {
      const speed = TRANSIT_SPEED_MPS[transport] || 5.0;
      return Math.round(meters / speed) + (TRANSIT_OVERHEAD_SEC[transport] || 0);
    };

    // 경로 요청이 모두 실패할 때 쓰는 직선거리(미터)
    const haversineMeters = (a, b) => {
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
      return Math.round(2 * R * Math.asin(Math.sqrt(h)));
    };
    // 직선거리 추정에 쓰는 대략 속도(m/s)
    const STRAIGHT_SPEED_MPS = { '도보': 1.3, '버스': 5.0, '지하철': 9.0, '택시': 8.0 };

    // 모든 leg의 표시 텍스트를 한국어 "시간/분", "m/km"으로 통일한다.
    // 추정값(estimated)에는 소요시간 앞에 '약'을 붙인다.
    const normalizeLeg = (leg, estimated) => ({
      ...leg,
      distance: {
        value: leg.distance?.value || 0,
        text: fmtDist(leg.distance?.value || 0),
      },
      duration: {
        value: leg.duration?.value || 0,
        text: (estimated ? '약 ' : '') + fmtDur(leg.duration?.value || 0),
      },
    });

    // Directions 단일 호출을 Promise로 감싸고, 요청 과다(OVER_QUERY_LIMIT)는
    // 백오프 후 재시도한다. 여러 구간을 한꺼번에 병렬로 쏘면 구글이 OVER_QUERY_LIMIT로
    // 거의 다 막아버려, 짧은 도보 구간까지 전부 실패→추정(약)으로 떨어진다.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // 순차 호출이라 순간 과부하는 드물다. 일시적 OVER_QUERY_LIMIT만 짧게 한 번
    // 재시도하고, 그래도 막히면(주로 일일 한도 소진) 바로 다음 후보/추정으로 넘어가
    // 앱이 멈칫하지 않게 한다.
    const directionsRoute = async (request) => {
      for (let attempt = 0; attempt <= 1; attempt++) {
        const { response, status } = await new Promise((resolve) => {
          directionsServiceRef.current.route(request, (resp, stat) =>
            resolve({ response: resp, status: stat })
          );
        });
        if (status === 'OK' && response?.routes?.[0]) return response;
        if (status === 'OVER_QUERY_LIMIT' && attempt === 0) {
          await sleep(500);
          continue;
        }
        return null; // 한도 소진/ZERO_RESULTS 등은 즉시 다음 후보로
      }
      return null;
    };

    // 한 구간을 해당 이동수단으로 계산한다. 후보를 우선순위대로 시도하며,
    // 결과가 없으면 다음 후보로 폴백한다. 모든 경로가 실패해도 직선거리 기반
    // 추정치를 반환해 "시간이 아예 안 뜨는" 경우가 없도록 한다.
    // 동일 구간은 캐시를 재사용한다.
    const routeSegment = async (from, to, transport) => {
      if (from?.lat == null || from?.lng == null || to?.lat == null || to?.lng == null) {
        return { response: null, leg: null };
      }
      const cacheKey = `${from.lat},${from.lng}|${to.lat},${to.lng}|${transport || ''}`;
      const cached = legCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const origin = { lat: from.lat, lng: from.lng };
      const destination = { lat: to.lat, lng: to.lng };
      const chain = requestChainFor(transport);

      for (const attempt of chain) {
        const response = await directionsRoute({ origin, destination, ...attempt.request });
        if (response) {
          const rawLeg = response.routes[0].legs[0];
          let leg;
          if (attempt.estimateAs) {
            // 실제 경로(거리)만 쓰고 소요시간은 수단별 속도로 추정
            const meters = rawLeg.distance?.value || 0;
            leg = normalizeLeg(
              { ...rawLeg, duration: { value: estimatedSeconds(meters, attempt.estimateAs) } },
              true
            );
          } else {
            leg = normalizeLeg(rawLeg, false);
          }
          const result = { response, leg };
          legCacheRef.current.set(cacheKey, result);
          return result;
        }
      }

      // 모든 경로 실패 시: 직선거리 기반 추정 (항상 무언가는 보여준다).
      // 실제 경로가 나중에 잡힐 여지를 위해 캐시에는 저장하지 않는다.
      const meters = haversineMeters(origin, destination);
      const speed = STRAIGHT_SPEED_MPS[transport] || 1.3;
      const sec = Math.round(meters / speed) + (TRANSIT_OVERHEAD_SEC[transport] || 0);
      return {
        response: null,
        leg: {
          distance: { value: meters, text: fmtDist(meters) },
          duration: { value: sec, text: `약 ${fmtDur(sec)}` },
        },
      };
    };

    if (routeMarkers.length >= 2) {
      const pairs = [];
      for (let i = 0; i < routeMarkers.length - 1; i++) {
        // 구간의 이동수단은 출발 지점(앞 카드)에서 고른 값을 따른다.
        pairs.push([routeMarkers[i], routeMarkers[i + 1], routeMarkers[i].transport]);
      }

      (async () => {
        // 순차 호출로 요청 과다(OVER_QUERY_LIMIT)를 피한다.
        const results = [];
        for (const [from, to, transport] of pairs) {
          results.push(await routeSegment(from, to, transport));
        }

        // 계산 중 경로가 또 바뀌었다면(최신 시그니처와 다르면) 낡은 결과는 버린다.
        if (lastRouteSignatureRef.current !== routeSignature) return;

        clearRoute();

        // 구간별 경로를 각각 그린다 (마커는 아래에서 직접 번호로 표시).
        results.forEach(({ response }) => {
          if (!response) return;
          const renderer = new window.google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            preserveViewport: true,
          });
          renderer.setDirections(response);
          segmentRenderersRef.current.push(renderer);
        });

        // 방문 순서 번호 마커
        routeMarkers.forEach((p, idx) => {
          if (p.lat == null || p.lng == null) return;
          const marker = new window.google.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            label: { text: String(idx + 1), color: '#fff', fontSize: '12px', fontWeight: 'bold' },
            title: p.name,
          });
          marker.addListener('click', () => {
            infoWindowRef.current.setContent(
              `<div style="font-size:13px;font-weight:600;color:#333;padding:2px 4px;">${idx + 1}. ${escapeHtml(p.name)}</div>`
            );
            infoWindowRef.current.open({ map, anchor: marker });
          });
          routePointMarkersRef.current.push(marker);
        });

        // 타임라인에 구간 순서대로 leg 전달 (실패한 구간은 null)
        if (onRouteCalculated) onRouteCalculated(results.map(r => r.leg));

        // Fit bounds ONLY when marker count changes or it's the first time
        if (routeMarkers.length !== lastMarkerCountRef.current) {
          const bounds = new window.google.maps.LatLngBounds();
          routeMarkers.forEach(p => {
            if (p.lat != null && p.lng != null) bounds.extend({ lat: p.lat, lng: p.lng });
          });
          if (!bounds.isEmpty()) map.fitBounds(bounds);
          lastMarkerCountRef.current = routeMarkers.length;
        }
      })();
    } else {
      clearRoute();

      if (routeMarkers.length === 1 && storageMarkers.length === 0 && lastMarkerCountRef.current !== 1) {
        map.setCenter({ lat: routeMarkers[0].lat, lng: routeMarkers[0].lng });
        map.setZoom(15);
        lastMarkerCountRef.current = 1;
      } else if (routeMarkers.length === 0) {
        lastMarkerCountRef.current = 0;
      }
    }
  }, [map, routeMarkers, storageMarkers.length, onRouteCalculated]);

  return (
    <div style={{ width: '100%', height: height || '35vh', backgroundColor: '#e0e0e0', position: 'relative', overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {map && (
        <div style={{
          position: 'absolute', bottom: '8px', left: '8px', zIndex: 1,
          background: 'rgba(255,255,255,0.92)', borderRadius: '8px',
          padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px',
          fontSize: '11px', color: '#444', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          maxWidth: '70%',
        }}>
          {[
            { emoji: '📷', label: '관광명소' },
            { emoji: '🍴', label: '맛집' },
            { emoji: '☕', label: '카페' },
            { emoji: '🏨', label: '숙소' },
            { emoji: '📍', label: '기타' },
          ].map((c) => (
            <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              {c.emoji}{c.label}
            </span>
          ))}
        </div>
      )}
      {!map && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px', textAlign: 'center' }}>
          지도 로딩 중...
        </div>
      )}
    </div>
  );
};

export default Map;
