import React, { useState, useEffect } from 'react';
import {
  Eye,
  MessageSquareShare,
  MapPin,
  Clock,
  ShieldCheck,
  Send,
  AlertTriangle,
  Flame,
  Droplets,
  Zap,
  Building2,
  Stethoscope,
  Undo2,
  CheckCircle2,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import { IncidentCategory, WitnessType, GeoLocation } from '../types';
import { PILOT_NEIGHBORHOODS } from '../data/pilotNeighborhood';

export const ReportForm: React.FC = () => {
  const {
    submitReport,
    retractReport,
    captureSeenSetSnapshot,
    neighborhood,
    state,
    deviceId,
    rateLimitExceeded,
  } = useCrisisCache();

  // Mandatory first question: no default!
  const [witnessType, setWitnessType] = useState<WitnessType | null>(null);
  const [category, setCategory] = useState<IncidentCategory>('FLOODING');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [description, setDescription] = useState<string>('');
  const [locNeighborhood, setLocNeighborhood] = useState<string>(neighborhood);
  const [landmark, setLandmark] = useState<string>('');
  const [seenSetSnapshot, setSeenSetSnapshot] = useState<string[]>([]);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Capture causal seenSet snapshot as soon as the user focuses on or opens this reporting form
  useEffect(() => {
    setSeenSetSnapshot(captureSeenSetSnapshot());
  }, [captureSeenSetSnapshot]);

  const categories: Array<{ id: IncidentCategory; label: string; icon: any; color: string }> = [
    { id: 'FLOODING', label: 'Flooding', icon: Droplets, color: 'text-blue-400' },
    { id: 'ROAD_BLOCKAGE', label: 'Road Blockage', icon: AlertTriangle, color: 'text-amber-400' },
    { id: 'FIRE', label: 'Fire / Hazard', icon: Flame, color: 'text-red-400' },
    { id: 'UTILITY_FAILURE', label: 'Utility Outage', icon: Zap, color: 'text-yellow-400' },
    { id: 'STRUCTURAL_DAMAGE', label: 'Structural Damage', icon: Building2, color: 'text-orange-400' },
    { id: 'MEDICAL_EMERGENCY', label: 'Medical Post', icon: Stethoscope, color: 'text-emerald-400' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!witnessType) {
      alert('Please declare whether you witnessed this yourself or heard about it.');
      return;
    }
    if (!description.trim()) return;

    setIsSubmitting(true);
    const location: GeoLocation = {
      lat: 37.776,
      lng: -122.418,
      neighborhood: locNeighborhood,
      landmark: landmark.trim() || undefined,
    };

    const id = await submitReport({
      category,
      witnessType,
      urgency,
      description,
      location,
      observedAt: Date.now(),
      seenSetSnapshot,
    });

    setIsSubmitting(false);
    setSubmittedReportId(id);
  };

  const handleRetract = async () => {
    if (!submittedReportId) return;
    await retractReport(submittedReportId);
    setSubmittedReportId(null);
    setDescription('');
    setWitnessType(null);
  };

  const resetForm = () => {
    setSubmittedReportId(null);
    setDescription('');
    setLandmark('');
    setWitnessType(null);
    setSeenSetSnapshot(captureSeenSetSnapshot());
  };

  // Find receipt information if submitted
  const receipt = submittedReportId
    ? state.deliveryReceipts.find((r) => r.id === submittedReportId)
    : null;
  const targetReport = submittedReportId
    ? state.reports.find((r) => r.id === submittedReportId)
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100">
      <div className="border-b border-slate-800 pb-3 mb-4">
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400" />
          <span>Report What You See</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Blind Witness causal evidence engine: stores observation with snapshot of what this phone knew.
        </p>
      </div>

      {rateLimitExceeded && (
        <div className="mb-4 p-3 bg-amber-950/60 border border-amber-600/50 rounded-xl text-xs text-amber-200">
          <strong>Rate Limiting Active (FR-15):</strong> High submission rate detected. Local writes are persisted, but excess sync batches are deprioritized.
        </div>
      )}

      {submittedReportId && targetReport ? (
        /* Honest Receipt View */
        <div className="space-y-4 animate-in fade-in">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-mono text-cyan-400">
                REPORT #{submittedReportId.slice(0, 10)}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                SAVED LOCALLY
              </span>
            </div>

            <div className="text-xs space-y-1.5">
              <div className="text-slate-200 font-semibold text-sm">
                &ldquo;{targetReport.description}&rdquo;
              </div>
              <div className="text-slate-400">
                Category: <span className="text-white font-medium">{targetReport.category}</span> • Location: <span className="text-white font-medium">{targetReport.location.neighborhood}</span>
              </div>
              <div className="text-slate-400">
                Declaration: <span className="text-cyan-300 font-bold">{targetReport.witnessType}</span> • Causal Independence:{' '}
                <span className={targetReport.isIndependent ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {targetReport.isIndependent ? 'INDEPENDENT WITNESS' : 'NON-INDEPENDENT / HEARSAY'}
                </span>
              </div>
            </div>

            {/* Delivery Reach Indicator (FR-9) */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Delivery Reach:</span>
                <span className="text-cyan-400 font-bold">
                  {receipt && receipt.reachedCoordinator
                    ? 'Reached a Credentialed Coordinator'
                    : receipt && receipt.reachedDeviceIds.length > 0
                    ? `Reached ${receipt.reachedDeviceIds.length} peer device(s)`
                    : 'On this phone only'}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: receipt && receipt.reachedCoordinator
                      ? '100%'
                      : receipt && receipt.reachedDeviceIds.length > 0
                      ? '66%'
                      : '33%',
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Receipts track transport delivery only — never confused with incident corroboration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetForm}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition min-h-touch"
            >
              Submit Another Report
            </button>
            <button
              onClick={handleRetract}
              className="px-4 py-2.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/80 rounded-xl text-xs font-bold transition flex items-center gap-1.5 min-h-touch"
              title="Retract this report (emits Retracted event per FR-14)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Retract</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Question 1: Firsthand vs Hearsay declaration */}
          <div>
            <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-2">
              1. Did you see this yourself, or hear about it? <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWitnessType('FIRSTHAND')}
                className={`p-3.5 rounded-xl border text-left transition flex items-start gap-2.5 min-h-touch ${
                  witnessType === 'FIRSTHAND'
                    ? 'bg-cyan-950 border-cyan-500 text-white ring-2 ring-cyan-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Eye className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-white">Saw it myself</div>
                  <div className="text-[11px] text-slate-400">Direct personal observation</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWitnessType('HEARSAY')}
                className={`p-3.5 rounded-xl border text-left transition flex items-start gap-2.5 min-h-touch ${
                  witnessType === 'HEARSAY'
                    ? 'bg-amber-950/80 border-amber-500 text-white ring-2 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <MessageSquareShare className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-white">Heard about it</div>
                  <div className="text-[11px] text-slate-400">Word-of-mouth or relay</div>
                </div>
              </button>
            </div>
          </div>

          {/* Category selection */}
          <div>
            <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-2">
              2. Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition min-h-touch ${
                      category === cat.id
                        ? 'bg-slate-800 border-cyan-500 text-white font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${cat.color}`} />
                    <span className="text-xs">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Neighborhood
              </label>
              <select
                value={locNeighborhood}
                onChange={(e) => setLocNeighborhood(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 min-h-touch"
              >
                {PILOT_NEIGHBORHOODS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-cyan-400" />
                Landmark / Specific Spot
              </label>
              <input
                type="text"
                placeholder="e.g. 4th St underpass rail bridge"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 min-h-touch"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              What did you observe?
            </label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Water is waist-high and rising fast across 4th St underpass. Roadway impassable."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !witnessType || !description.trim()}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold rounded-xl text-sm tracking-wide shadow-lg shadow-cyan-950 transition active:scale-95 disabled:opacity-40 min-h-touch flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'SIGNING WITH ED25519...' : 'RECORD OBSERVATION'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
