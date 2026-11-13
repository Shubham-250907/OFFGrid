import React, { useState } from 'react';
import {
  Incident,
  IncidentStatus,
  IncidentCategory,
} from '../types';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  Droplets,
  Flame,
  Zap,
  Building2,
  Stethoscope,
  Filter,
  ChevronRight,
  Clock,
  MapPin,
} from 'lucide-react';
import { IncidentDetail } from './IncidentDetail';

interface IncidentListProps {
  incidents: Incident[];
  isCommandDensity?: boolean;
}

export const IncidentList: React.FC<IncidentListProps> = ({
  incidents,
  isCommandDensity = false,
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const filteredIncidents = incidents.filter((inc) => {
    if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && inc.category !== categoryFilter) return false;
    return true;
  });

  const getCategoryIcon = (category: IncidentCategory) => {
    switch (category) {
      case 'FLOODING':
        return <Droplets className="w-4 h-4 text-blue-400" />;
      case 'FIRE':
        return <Flame className="w-4 h-4 text-red-400" />;
      case 'ROAD_BLOCKAGE':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'UTILITY_FAILURE':
        return <Zap className="w-4 h-4 text-yellow-400" />;
      case 'STRUCTURAL_DAMAGE':
        return <Building2 className="w-4 h-4 text-orange-400" />;
      case 'MEDICAL_EMERGENCY':
        return <Stethoscope className="w-4 h-4 text-emerald-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'CORROBORATED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            CORROBORATED
          </span>
        );
      case 'CONTESTED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-950 text-red-300 border border-red-700/60 flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            CONTESTED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-700/60 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            RESOLVED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            UNVERIFIED
          </span>
        );
    }
  };

  const getFreshnessBadge = (freshness: string) => {
    switch (freshness) {
      case 'CURRENT':
        return <span className="text-[10px] text-emerald-400 font-mono">CURRENT</span>;
      case 'AGING':
        return <span className="text-[10px] text-amber-400 font-mono">AGING</span>;
      default:
        return <span className="text-[10px] text-slate-500 font-mono">STALE</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['ALL', 'CORROBORATED', 'CONTESTED', 'UNVERIFIED', 'RESOLVED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
                statusFilter === status
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filteredIncidents.length} of {incidents.length} incident cluster(s)
        </div>
      </div>

      {/* Incidents List */}
      {filteredIncidents.length === 0 ? (
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
          <HelpCircle className="w-8 h-8 mx-auto text-slate-600" />
          <p className="font-semibold text-sm">No incidents match current filters.</p>
          <p className="text-xs text-slate-500">
            Submit a report or run a demo scenario to see live evidence clustering.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              onClick={() => setSelectedIncident(inc)}
              className={`bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl transition cursor-pointer shadow-md text-slate-100 ${
                isCommandDensity ? 'p-3' : 'p-4'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  {/* Category, Location, and Status Badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 font-bold text-sm text-white">
                      {getCategoryIcon(inc.category)}
                      <span>{inc.category.replace('_', ' ')}</span>
                    </span>

                    <span className="text-slate-600">•</span>

                    <span className="text-xs text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>{inc.location.landmark || inc.location.neighborhood}</span>
                    </span>

                    {getStatusBadge(inc.status)}
                    {getFreshnessBadge(inc.freshnessStatus)}
                  </div>

                  {/* Plain-Language Confidence Line (PRD Signature Requirement) */}
                  <div className="text-xs font-medium text-slate-300 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                    {inc.confidenceSummary}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono pt-0.5">
                    <span>
                      Independent Witnesses: <strong className="text-emerald-400">{inc.independentWitnessCount}</strong>
                    </span>
                    <span>
                      Hearsay Relays: <strong className="text-amber-400">{inc.hearsayCount}</strong>
                    </span>
                    <span>
                      Last Update: {new Date(inc.lastUpdateAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="text-slate-500 self-center">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </div>
  );
};
