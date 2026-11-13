import React, { useState } from 'react';
import {
  Incident,
  DistressRequest,
  GeoLocation,
} from '../types';
import {
  PILOT_BOUNDS,
  PILOT_LANDMARKS,
  PILOT_STREETS,
  Landmark,
} from '../data/pilotNeighborhood';
import {
  MapPin,
  AlertTriangle,
  Flame,
  Droplets,
  ShieldAlert,
  Home,
  Stethoscope,
  Radio,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface OfflineMapProps {
  incidents: Incident[];
  distressRequests: DistressRequest[];
  onSelectIncident?: (incident: Incident) => void;
}

export const OfflineMap: React.FC<OfflineMapProps> = ({
  incidents,
  distressRequests,
  onSelectIncident,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [selectedPin, setSelectedPin] = useState<{
    type: 'INCIDENT' | 'DISTRESS' | 'LANDMARK';
    data: any;
  } | null>(null);

  // Coordinate projection to SVG viewBox (1000 x 700)
  const mapWidth = 1000;
  const mapHeight = 700;

  const projectCoord = (lat: number, lng: number) => {
    const latSpan = PILOT_BOUNDS.maxLat - PILOT_BOUNDS.minLat;
    const lngSpan = PILOT_BOUNDS.maxLng - PILOT_BOUNDS.minLng;

    const x = ((lng - PILOT_BOUNDS.minLng) / lngSpan) * mapWidth;
    const y = ((PILOT_BOUNDS.maxLat - lat) / latSpan) * mapHeight;

    return { x, y };
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-100 flex flex-col">
      {/* Map Control Bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
            <Layers className="w-3.5 h-3.5" />
            <span>PILOT DISTRICT: NORTH WARD & RIVERFRONT</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 hidden sm:inline">100% Offline Vector Layer</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2.0))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.8))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            title="Reset Zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative overflow-hidden bg-slate-950 aspect-[16/10] sm:aspect-[2/1] w-full select-none cursor-grab active:cursor-grabbing">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="w-full h-full transition-transform duration-300"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          {/* Background Grid Lines */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={mapWidth} height={mapHeight} fill="#090d16" />
          <rect width={mapWidth} height={mapHeight} fill="url(#grid)" />

          {/* River / Waterway Feature */}
          <path
            d="M 850 0 Q 820 300 880 700"
            fill="none"
            stroke="#0369a1"
            strokeWidth="35"
            strokeOpacity="0.4"
          />
          <text x="860" y="350" fill="#38bdf8" fontSize="12" fontFamily="monospace" opacity="0.6" transform="rotate(75, 860, 350)">
            RIVERFRONT CORRIDOR
          </text>

          {/* Streets */}
          {PILOT_STREETS.map((st) => {
            const pointsStr = st.points
              .map((p) => {
                const proj = projectCoord(p.lat, p.lng);
                return `${proj.x},${proj.y}`;
              })
              .join(' ');
            return (
              <g key={st.id}>
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Critical Community Landmarks */}
          {PILOT_LANDMARKS.map((lm) => {
            const { x, y } = projectCoord(lm.location.lat, lm.location.lng);
            return (
              <g
                key={lm.id}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onClick={() => setSelectedPin({ type: 'LANDMARK', data: lm })}
              >
                <circle r="12" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                {lm.type === 'SHELTER' && <Home x="-6" y="-6" width="12" height="12" className="text-emerald-400" />}
                {lm.type === 'HOSPITAL' && <Stethoscope x="-6" y="-6" width="12" height="12" className="text-red-400" />}
                {lm.type === 'COMMAND' && <Radio x="-6" y="-6" width="12" height="12" className="text-cyan-400" />}
                {lm.type === 'HAZARD' && <AlertTriangle x="-6" y="-6" width="12" height="12" className="text-amber-400" />}
                <text y="22" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">
                  {lm.name.split(' (')[0]}
                </text>
              </g>
            );
          })}

          {/* Active Incidents */}
          {incidents.map((inc) => {
            const { x, y } = projectCoord(inc.location.lat, inc.location.lng);
            const isContested = inc.status === 'CONTESTED';
            const isCorroborated = inc.status === 'CORROBORATED';
            const ringColor = isContested ? '#ef4444' : isCorroborated ? '#10b981' : '#f59e0b';

            return (
              <g
                key={inc.id}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedPin({ type: 'INCIDENT', data: inc });
                  if (onSelectIncident) onSelectIncident(inc);
                }}
              >
                {/* Pulsing ring */}
                <circle r="20" fill={ringColor} fillOpacity="0.2" className="animate-ping" />
                <circle r="14" fill="#0f172a" stroke={ringColor} strokeWidth="2.5" />
                {inc.category === 'FLOODING' && <Droplets x="-6" y="-6" width="12" height="12" className="text-blue-400" />}
                {inc.category === 'FIRE' && <Flame x="-6" y="-6" width="12" height="12" className="text-red-400" />}
                {inc.category === 'ROAD_BLOCKAGE' && <AlertTriangle x="-6" y="-6" width="12" height="12" className="text-amber-400" />}

                <text y="26" fill="#f8fafc" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="#000" strokeWidth="2" paintOrder="stroke">
                  {inc.category.replace('_', ' ')}
                </text>
              </g>
            );
          })}

          {/* Active Distress Calls (Pulsing Red Marker) */}
          {distressRequests
            .filter((d) => d.status !== 'RESOLVED')
            .map((d) => {
              const { x, y } = projectCoord(d.location.lat, d.location.lng);
              return (
                <g
                  key={d.id}
                  transform={`translate(${x + 10}, ${y - 10})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedPin({ type: 'DISTRESS', data: d })}
                >
                  <circle r="22" fill="#dc2626" fillOpacity="0.4" className="animate-ping" />
                  <circle r="14" fill="#7f1d1d" stroke="#ef4444" strokeWidth="3" />
                  <ShieldAlert x="-7" y="-7" width="14" height="14" className="text-white animate-pulse" />
                  <text y="-18" fill="#fca5a5" fontSize="10" fontWeight="extrabold" textAnchor="middle">
                    DISTRESS ({d.peopleCount} ppl)
                  </text>
                </g>
              );
            })}
        </svg>

        {/* Selected Item Floating Card */}
        {selectedPin && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-slate-900/95 border border-slate-700 backdrop-blur rounded-xl p-3.5 shadow-2xl text-xs space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-cyan-400 uppercase tracking-wider font-mono">
                {selectedPin.type}
              </span>
              <button
                onClick={() => setSelectedPin(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {selectedPin.type === 'INCIDENT' && (
              <div className="space-y-1">
                <div className="font-bold text-white text-sm">
                  {selectedPin.data.category.replace('_', ' ')}
                </div>
                <div className="text-slate-300">{selectedPin.data.confidenceSummary}</div>
                <div className="text-slate-400 font-mono text-[11px] pt-1">
                  Status: <strong>{selectedPin.data.status}</strong> • Witnesses: {selectedPin.data.independentWitnessCount}
                </div>
              </div>
            )}

            {selectedPin.type === 'DISTRESS' && (
              <div className="space-y-1">
                <div className="font-bold text-red-400 text-sm flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>EMERGENCY DISTRESS: {selectedPin.data.category}</span>
                </div>
                <div className="text-slate-200">&ldquo;{selectedPin.data.description}&rdquo;</div>
                <div className="text-amber-300 font-mono text-[11px]">
                  Status: <strong>{selectedPin.data.status}</strong> • People in Danger: {selectedPin.data.peopleCount}
                </div>
              </div>
            )}

            {selectedPin.type === 'LANDMARK' && (
              <div className="space-y-1">
                <div className="font-bold text-white text-sm">{selectedPin.data.name}</div>
                <div className="text-slate-300">{selectedPin.data.description}</div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Neighborhood: {selectedPin.data.location.neighborhood}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Corroborated (&ge; 2 Witnesses)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Contested / Conflicting
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Unverified / Single Witness
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-red-400" /> Active Distress
          </span>
        </div>
      </div>
    </div>
  );
};
