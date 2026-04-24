import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

const Map = ({ storageMarkers = [], routeMarkers = [], onRouteOptimized, onRouteCalculated, height }) => {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const markersRef = useRef([]);

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
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map: mapInstance,
          suppressMarkers: false, // let it draw markers for the route
          preserveViewport: true, // Allow manual zoom freedom
        });

        setMap(mapInstance);
      } catch (e) {
        console.error("Map load error", e);
      }
    };

    initMap();
  }, []);

  // Track marker count to fit bounds only when needed
  const lastMarkerCountRef = useRef(0);

  // Effect to handle storage markers
  useEffect(() => {
    if (!map || !window.google) return;

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
    if (!map || !window.google || !directionsServiceRef.current || !directionsRendererRef.current) return;

    if (routeMarkers.length >= 2) {
      const origin = { lat: routeMarkers[0].lat, lng: routeMarkers[0].lng };
      const destination = { lat: routeMarkers[routeMarkers.length - 1].lat, lng: routeMarkers[routeMarkers.length - 1].lng };
      
      const waypoints = routeMarkers.slice(1, -1).map(p => ({
        location: { lat: p.lat, lng: p.lng },
        stopover: true
      }));

      directionsServiceRef.current.route({
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.WALKING // or DRIVING
      }, (response, status) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(response);
          
          // Fit bounds ONLY when marker count changes or it's the first time
          if (routeMarkers.length !== lastMarkerCountRef.current) {
             const bounds = new window.google.maps.LatLngBounds();
             routeMarkers.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
             map.fitBounds(bounds);
             lastMarkerCountRef.current = routeMarkers.length;
          }

          if (onRouteOptimized && response.routes[0].waypoint_order && response.routes[0].waypoint_order.length > 0) {
             onRouteOptimized(response.routes[0].waypoint_order);
          }
          if (onRouteCalculated && response.routes[0].legs) {
             onRouteCalculated(response.routes[0].legs);
          }
        } else {
          console.error("Directions request failed due to " + status);
          directionsRendererRef.current.setDirections({ routes: [] });
          
          const bounds = new window.google.maps.LatLngBounds();
          routeMarkers.forEach(place => {
            if (place.lat && place.lng) {
              bounds.extend({ lat: place.lat, lng: place.lng });
            }
          });
          if (routeMarkers.length !== lastMarkerCountRef.current) {
            map.fitBounds(bounds);
            lastMarkerCountRef.current = routeMarkers.length;
          }
        }
      });
    } else {
      directionsRendererRef.current.setDirections({ routes: [] });
      
      if (routeMarkers.length === 1 && storageMarkers.length === 0 && lastMarkerCountRef.current !== 1) {
        map.setCenter({ lat: routeMarkers[0].lat, lng: routeMarkers[0].lng });
        map.setZoom(15);
        lastMarkerCountRef.current = 1;
      } else if (routeMarkers.length === 0) {
        lastMarkerCountRef.current = 0;
      }
    }
  }, [map, routeMarkers, storageMarkers.length, onRouteOptimized]);

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
