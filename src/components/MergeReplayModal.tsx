import React from 'react';
import {
  GitMerge,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { MergeReplayDiff, IncidentStatus } from '../types';

interface MergeReplayModalProps {
  diff: MergeReplayDiff;
  onClose: () => void;
}

export const MergeReplayModal: React.FC<MergeReplayModalProps> = ({ diff, onClose }) => {
  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'CORROBORATED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
            CORROBORATED
          </span>
        );
      case 'CONTESTED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-950 text-red-300 border border-red-700 animate-pulse">
            CONTESTED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-700">
            RESOLVED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
            UNVERIFIED
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border-2 border-cyan-500/70 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/30 border border-cyan-400 flex items-center justify-center text-cyan-400">
              <GitMerge className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-700">
                  SIGNATURE INTERACTION
                </span>
                <span className="text-xs text-slate-400">
                  {diff.incomingEventCount} incoming event(s)
                </span>
              </div>
              <h2 className="text-lg font-black text-white mt-0.5">
                Merge Replay: Partition Belief Evolution
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg min-h-touch min-w-touch flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="p-3.5 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-xs text-cyan-200">
            <strong>Partition Merge Completed:</strong> New observations arrived from a previously isolated network partition. Below is the exact belief diff showing what this device believed before vs after, and the specific causal events that triggered each change.
          </div>

          <div className="space-y-4">
            {diff.affectedIncidents.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-white text-sm">
                    {item.category.replace('_', ' ')} • {item.locationName}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {item.incidentId}
                  </span>
                </div>

                {/* 2-Panel Before vs After Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  {/* Before */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                      Before Partition Merge
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.beforeStatus)}
                      <span className="text-xs text-slate-400 font-mono">
                        {item.beforeWitnessCount} witness(es)
                      </span>
                    </div>
                  </div>

                  {/* After */}
                  <div className="p-3 rounded-lg bg-slate-900/90 border border-cyan-700/60 space-y-1.5">
                    <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>After Merge & Projection</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(item.afterStatus)}
                      <span className="text-xs text-cyan-300 font-mono font-bold">
                        {item.afterWitnessCount} witness(es)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plain-Language Reason */}
                <div className="p-2.5 bg-slate-900 rounded-lg text-xs text-slate-300 border border-slate-800 flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Why this changed:</strong> {item.changeReason}
                  </span>
                </div>

                {/* Newly arrived reports */}
                {item.newReportSummaries.length > 0 && (
                  <div className="text-xs space-y-1 pt-1">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Incoming Observation(s):
                    </div>
                    {item.newReportSummaries.map((sum, sIdx) => (
                      <div
                        key={sIdx}
                        className="text-slate-300 italic pl-3 border-l-2 border-cyan-500 py-0.5"
                      >
                        {sum}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            State updated deterministically via pure event-log projection.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition min-h-touch"
          >
            Acknowledge & Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
