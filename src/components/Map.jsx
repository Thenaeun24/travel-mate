import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

const Map = ({ storageMarkers = [], routeMarkers = [], onRouteCalculated, height }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const directionsServiceRef = useRef(null);
  // 구간(leg)별로 교통수단이 다를 수 있어 구간마다 별도의 Renderer를 쓴다.
  const segmentRenderersRef = useRef([]);
  const routePointMarkersRef = useRef([]);
  const markersRef = useRef([]);
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
      .map(p => `${p.lat},${p.lng},${p.name || ''}`)
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
        const marker = new window.google.maps.Marker({
          position,
          map,
          title: place.name
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

    // 일정에서 고른 이동수단 → Google Directions 옵션 매핑
    const travelOptionsFor = (transport) => {
      const g = window.google.maps;
      switch (transport) {
        case '버스':
          return { travelMode: g.TravelMode.TRANSIT, transitOptions: { modes: [g.TransitMode.BUS] } };
        case '지하철':
          return { travelMode: g.TravelMode.TRANSIT, transitOptions: { modes: [g.TransitMode.SUBWAY] } };
        case '택시':
          return { travelMode: g.TravelMode.DRIVING };
        case '도보':
        default:
          return { travelMode: g.TravelMode.WALKING };
      }
    };

    // 한 구간을 해당 이동수단으로 계산한다. 대중교통/운전이 실패하면(데이터 없음 등)
    // 도보로 폴백해 최소한 시간이 비지 않도록 한다.
    // 동일 구간은 캐시를 재사용해 API 재호출을 피한다.
    const routeSegment = (from, to, transport) => new Promise((resolve) => {
      const g = window.google.maps;
      if (from?.lat == null || from?.lng == null || to?.lat == null || to?.lng == null) {
        resolve({ response: null, leg: null });
        return;
      }
      const cacheKey = `${from.lat},${from.lng}|${to.lat},${to.lng}|${transport || ''}`;
      const cached = legCacheRef.current.get(cacheKey);
      if (cached) {
        resolve(cached);
        return;
      }

      const origin = { lat: from.lat, lng: from.lng };
      const destination = { lat: to.lat, lng: to.lng };
      const opts = travelOptionsFor(transport);

      directionsServiceRef.current.route(
        { origin, destination, ...opts },
        (response, status) => {
          if (status === 'OK' && response.routes?.[0]) {
            const result = { response, leg: response.routes[0].legs[0] };
            legCacheRef.current.set(cacheKey, result);
            resolve(result);
          } else if (opts.travelMode !== g.TravelMode.WALKING) {
            directionsServiceRef.current.route(
              { origin, destination, travelMode: g.TravelMode.WALKING },
              (res2, st2) => {
                if (st2 === 'OK' && res2.routes?.[0]) {
                  const result = { response: res2, leg: res2.routes[0].legs[0] };
                  legCacheRef.current.set(cacheKey, result);
                  resolve(result);
                } else {
                  // 실패는 캐시하지 않는다 (일시적 오류/한도 초과 시 이후 재시도 가능).
                  resolve({ response: null, leg: null });
                }
              }
            );
          } else {
            resolve({ response: null, leg: null });
          }
        }
      );
    });

    if (routeMarkers.length >= 2) {
      const pairs = [];
      for (let i = 0; i < routeMarkers.length - 1; i++) {
        // 구간의 이동수단은 출발 지점(앞 카드)에서 고른 값을 따른다.
        pairs.push([routeMarkers[i], routeMarkers[i + 1], routeMarkers[i].transport]);
      }

      Promise.all(pairs.map(([from, to, transport]) => routeSegment(from, to, transport)))
        .then((results) => {
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
        });
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
      {!map && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px', textAlign: 'center' }}>
          지도 로딩 중...
        </div>
      )}
    </div>
  );
};

export default Map;
