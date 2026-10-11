"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons for bundlers/Next.js
// (leaflet/default_icon_fix does not exist in the leaflet package, so we set
//  the default icon from the actual bundled images instead.)
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

/**
 * @param {{
 *   onLocationSelect: (lat: number, lng: number) => void;
 *   pickupCoords?: { lat: number; lng: number } | null;
 *   dropoffCoords?: { lat: number; lng: number } | null;
 * }} props
 */
export default function InteractiveMap({ onLocationSelect, pickupCoords = null, dropoffCoords = null }) {
  const [position, setPosition] = useState([34.3419, 62.2031]); // Default: Herat, Afghanistan

  function LocationMarker() {
    useMapEvents({
      click(e) {
        setPosition([e.latlng.lat, e.latlng.lng]);
        if (onLocationSelect) {
          onLocationSelect(e.latlng.lat, e.latlng.lng);
        }
      },
    });

    return (
      <>
        {pickupCoords && (
          <Marker position={[pickupCoords.lat, pickupCoords.lng]}>
            <Popup>مبدأ سفر</Popup>
          </Marker>
        )}
        {dropoffCoords && (
          <Marker position={[dropoffCoords.lat, dropoffCoords.lng]}>
            <Popup>مقصد سفر</Popup>
          </Marker>
        )}
        {!pickupCoords && !dropoffCoords && position !== null && (
          <Marker position={position}>
            <Popup>موقعیت انتخاب شده</Popup>
          </Marker>
        )}
      </>
    );
  }

  return (
    <div className="w-full h-72 rounded-xl overflow-hidden shadow-inner border border-gray-200 z-0">
      <MapContainer
        center={position}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker />
      </MapContainer>
    </div>
  );
}