import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

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

  const handlePasteOrEnter = async (e) => {
    const val = e.target.value;
    const regex = /google\..*\/maps\/place\/([^\/]+)\/@([\d.-]+),([\d.-]+)/i;
    const match = val.match(regex);
    
    if (match && (e.type === 'paste' || e.key === 'Enter')) {
      e.preventDefault();
      const name = decodeURIComponent(match[1].replace(/\+/g, ' '));
      const lat = parseFloat(match[2]);
      const lng = parseFloat(match[3]);
      
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
    } else if (e.key === 'Enter') {
      if (val.includes('http')) {
        alert("짧은 링크(maps.app.goo.gl 등)는 지원되지 않습니다. 구글맵의 긴 주소나 장소 이름을 검색해주세요.");
        setInputValue('');
      } else if (val.trim() !== '') {
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
          장소 검색 또는 구글맵 주소 붙여넣기
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
            placeholder={isSearching ? "검색 중..." : "예: 파리 에펠탑, 또는 주소 붙여넣기"}
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
