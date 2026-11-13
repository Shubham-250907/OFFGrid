import React from 'react';
import {
  ShieldAlert,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Truck,
  Check,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import { DistressRequest, DistressStatus, EscalationTier } from '../types';

export const DistressQueue: React.FC = () => {
  const { state, userRole, updateDistressStatus } = useCrisisCache();

  // Sort distress calls by escalation tier (CRITICAL > URGENT > STANDARD), then by createdAt ascending
  const tierWeight: Record<EscalationTier, number> = {
    CRITICAL: 3,
    URGENT: 2,
    STANDARD: 1,
  };

  const activeDistress = [...state.distressRequests]
    .filter((d) => d.status !== 'RESOLVED')
    .sort((a, b) => {
      const wDiff = (tierWeight[b.escalationTier as EscalationTier] || 1) - (tierWeight[a.escalationTier as EscalationTier] || 1);
      if (wDiff !== 0) return wDiff;
      return a.createdAt.physical - b.createdAt.physical;
    });

  const getTierBadge = (tier: EscalationTier) => {
    switch (tier) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-950 text-red-300 border border-red-500 animate-pulse flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            CRITICAL TIER
          </span>
        );
      case 'URGENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            URGENT TIER
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            STANDARD TIER
          </span>
        );
    }
  };

  const getStatusBadge = (status: DistressStatus) => {
    switch (status) {
      case 'EN_ROUTE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-700 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            EN ROUTE
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
            <Check className="w-3 h-3" />
            ACKNOWLEDGED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
            OPEN / UNANSWERED
          </span>
        );
    }
  };

  if (activeDistress.length === 0) return null;

  return (
    <div className="bg-slate-900 border-2 border-red-500/60 rounded-2xl p-4 shadow-xl text-slate-100 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500 animate-bounce" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-white">
            Unacknowledged Distress Queue ({activeDistress.length})
          </h3>
        </div>
        <span className="text-[11px] text-red-300 font-mono">
          Anti-Decay Escalation Ladder Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {activeDistress.map((d) => (
          <div
            key={d.id}
            className={`p-3 rounded-xl border transition ${
              d.escalationTier === 'CRITICAL'
                ? 'bg-red-950/40 border-red-500/80 shadow-md shadow-red-950/50'
                : d.escalationTier === 'URGENT'
                ? 'bg-amber-950/30 border-amber-600/70'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-white">
                    {d.category} EMERGENCY
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-300 flex items-center gap-1">
                    <Users className="w-3 h-3 text-cyan-400" />
                    <strong>{d.peopleCount}</strong> person(s)
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-400" />
                    {d.location.landmark || d.location.neighborhood}
                  </span>
                  {getTierBadge(d.escalationTier)}
                  {getStatusBadge(d.status)}
                </div>

                <div className="text-xs text-slate-200 font-medium">
                  &ldquo;{d.description}&rdquo;
                </div>

                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
                  <span>Author: {d.authorLabel || d.authorDeviceId.slice(0, 8)}</span>
                  <span>Created: {new Date(d.createdAt.physical).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Status Advancement Actions for Responders/Coordinators */}
              {userRole === 'COORDINATOR' && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  {d.status === 'OPEN' && (
                    <button
                      onClick={() => updateDistressStatus(d.id, 'ACKNOWLEDGED')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition min-h-touch"
                    >
                      Acknowledge
                    </button>
                  )}
                  {d.status === 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => updateDistressStatus(d.id, 'EN_ROUTE')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition min-h-touch"
                    >
                      En Route
                    </button>
                  )}
                  {d.status === 'EN_ROUTE' && (
                    <button
                      onClick={() => updateDistressStatus(d.id, 'RESOLVED')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition min-h-touch"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
