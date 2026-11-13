import React, { useState } from 'react';
import {
  Incident,
  Report,
  IncidentStatus,
  FreshnessStatus,
} from '../types';
import {
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Split,
  Merge,
  Eye,
  MessageSquareShare,
  X,
  UserCheck,
  Send,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';

interface IncidentDetailProps {
  incident: Incident;
  onClose: () => void;
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({ incident, onClose }) => {
  const {
    state,
    userRole,
    credential,
    resolveContradiction,
    splitCluster,
    mergeClusters,
  } = useCrisisCache();

  const [resolutionReason, setResolutionReason] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [isSplitting, setIsSplitting] = useState<boolean>(false);

  // Retrieve all reports belonging to this incident cluster
  const clusterReports = state.reports
    .filter((r) => incident.reportIds.includes(r.id))
    .sort((a, b) => a.observedAt - b.observedAt);

  // Group reports by author device for Timeline Swimlane View
  const deviceGroups = new Map<string, Report[]>();
  for (const r of clusterReports) {
    const list = deviceGroups.get(r.authorDeviceId) || [];
    list.push(r);
    deviceGroups.set(r.authorDeviceId, list);
  }

  const handleResolveContradiction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionReason.trim()) return;
    setIsResolving(true);
    await resolveContradiction(incident.id, resolutionReason.trim());
    setIsResolving(false);
    setResolutionReason('');
  };

  const handleSplitSelected = async () => {
    if (selectedReportIds.length === 0) return;
    await splitCluster(incident.id, selectedReportIds);
    setSelectedReportIds([]);
    setIsSplitting(false);
  };

  const toggleSelectReport = (id: string) => {
    if (selectedReportIds.includes(id)) {
      setSelectedReportIds(selectedReportIds.filter((item) => item !== id));
    } else {
      setSelectedReportIds([...selectedReportIds, id]);
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case 'CORROBORATED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            CORROBORATED
          </span>
        );
      case 'CONTESTED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-950 text-red-300 border border-red-700/60 flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            CONTESTED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-950 text-blue-300 border border-blue-700/60 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            RESOLVED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-950 text-amber-300 border border-amber-700/60 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            UNVERIFIED
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                {incident.id}
              </span>
              {getStatusBadge(incident.status)}
              <span className="text-xs text-slate-400 font-mono">
                Freshness: {incident.freshnessStatus}
              </span>
            </div>
            <h2 className="text-lg font-black text-white mt-1">
              {incident.category.replace('_', ' ')} • {incident.location.landmark || incident.location.neighborhood}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg min-h-touch min-w-touch flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Plain-Language Confidence Line (PRD Signature Requirement) */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Evidence Synthesis & Plain-Language Confidence
            </div>
            <div className="text-sm font-semibold text-white">
              {incident.confidenceSummary}
            </div>
            <div className="text-xs text-slate-400 font-mono pt-1">
              Independent firsthand devices: <span className="text-emerald-400 font-bold">{incident.independentWitnessCount}</span> • Hearsay reports: <span className="text-amber-400 font-bold">{incident.hearsayCount}</span> • Total cluster reports: {incident.totalWitnessCount}
            </div>
          </div>

          {/* Timeline with Swimlanes per Device (P11 specification) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Timeline & Device Swimlanes
              </h3>
              {userRole === 'COORDINATOR' && (
                <button
                  onClick={() => setIsSplitting(!isSplitting)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>{isSplitting ? 'Cancel Split' : 'Coordinator Split Override'}</span>
                </button>
              )}
            </div>

            {isSplitting && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-xs space-y-2">
                <p className="text-cyan-200">
                  Select reports below that belong to a distinct separate incident, then click Split Cluster.
                </p>
                <button
                  onClick={handleSplitSelected}
                  disabled={selectedReportIds.length === 0}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded font-bold"
                >
                  Split {selectedReportIds.length} Selected Report(s)
                </button>
              </div>
            )}

            <div className="space-y-3">
              {Array.from(deviceGroups.entries()).map(([deviceKey, reports]) => (
                <div
                  key={deviceKey}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800/80 pb-1.5">
                    <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      {reports[0].authorLabel || `Device ${deviceKey.slice(0, 8)}`}
                    </span>
                    <span className="text-slate-500">{reports.length} observation(s)</span>
                  </div>

                  <div className="space-y-2">
                    {reports.map((rep) => (
                      <div
                        key={rep.id}
                        onClick={() => isSplitting && toggleSelectReport(rep.id)}
                        className={`p-2.5 rounded-lg border text-xs space-y-1 transition ${
                          isSplitting && selectedReportIds.includes(rep.id)
                            ? 'bg-cyan-950 border-cyan-400'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {rep.witnessType === 'FIRSTHAND' ? (
                              <span className="text-cyan-400 flex items-center gap-1 font-bold">
                                <Eye className="w-3 h-3" /> Firsthand
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1 font-bold">
                                <MessageSquareShare className="w-3 h-3" /> Hearsay
                              </span>
                            )}

                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                rep.isIndependent
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {rep.isIndependent ? 'INDEPENDENT' : 'NON-INDEPENDENT'}
                            </span>

                            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              {rep.relationshipToCluster}
                            </span>
                          </div>

                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(rep.observedAt).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="text-slate-200 font-medium">
                          &ldquo;{rep.description}&rdquo;
                        </div>

                        {rep.relationshipToCluster === 'CONTRADICTION' && (
                          <div className="text-[11px] text-red-300 bg-red-950/60 p-1.5 rounded border border-red-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                            <span>Contradicts prevailing report state in cluster!</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coordinator Contradiction Resolution Panel */}
          {incident.status === 'CONTESTED' && (
            <div className="p-4 bg-red-950/30 border border-red-600/60 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Resolve Incident Contradiction (Coordinator Required)</span>
              </div>
              <p className="text-xs text-slate-300">
                This incident contains mutually conflicting claims. A credentialed Coordinator can resolve the conflict by providing an attributable reason string.
              </p>

              {userRole === 'COORDINATOR' ? (
                <form onSubmit={handleResolveContradiction} className="space-y-2">
                  <textarea
                    required
                    rows={2}
                    placeholder="Enter verifiable resolution reason (e.g. 'CERT scout physically verified water drained at 14:30')"
                    value={resolutionReason}
                    onChange={(e) => setResolutionReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isResolving || !resolutionReason.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{isResolving ? 'Resolving...' : 'Sign & Resolve Contradiction'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 bg-slate-950 rounded-lg text-xs text-amber-300 border border-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Coordinator role credential required to resolve contradictions. Switch to Coordinator Mode in the navbar to resolve.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition min-h-touch"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
