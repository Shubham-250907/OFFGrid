import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  X,
  Radio,
  FileCheck2,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import { DistressCategory, GeoLocation } from '../types';
import { PILOT_NEIGHBORHOODS } from '../data/pilotNeighborhood';

interface DistressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DistressModal: React.FC<DistressModalProps> = ({ isOpen, onClose }) => {
  const { submitDistress, neighborhood } = useCrisisCache();

  const [category, setCategory] = useState<DistressCategory>('RESCUE');
  const [peopleCount, setPeopleCount] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [locationNeighborhood, setLocationNeighborhood] = useState<string>(neighborhood);
  const [landmark, setLandmark] = useState<string>('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    const location: GeoLocation = {
      lat: 37.775,
      lng: -122.419,
      neighborhood: locationNeighborhood,
      landmark: landmark.trim() || undefined,
    };

    const id = await submitDistress({
      category,
      peopleCount,
      description,
      location,
    });

    setIsSubmitting(false);
    setSubmittedId(id);
  };

  const handleReset = () => {
    setSubmittedId(null);
    setDescription('');
    setLandmark('');
    setPeopleCount(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border-2 border-red-500/70 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 overflow-hidden relative">
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 min-h-touch min-w-touch flex items-center justify-center rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {submittedId ? (
          /* Honest Receipt for Distress Submission */
          <div className="space-y-5 animate-in slide-in-from-bottom-2">
            <div className="w-14 h-14 bg-red-950 border-2 border-red-500 rounded-full flex items-center justify-center mx-auto text-red-400">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-white">EMERGENCY RECORDED</h2>
              <p className="text-xs font-mono text-red-300">
                DISTRESS EVENT: {submittedId.slice(0, 16)}...
              </p>
            </div>

            {/* Honest Receipt Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                <span className="text-slate-400">Current Status:</span>
                <span className="font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800">
                  OPEN (UNACKNOWLEDGED)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                <span className="text-slate-400">Storage State:</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved on this device
                </span>
              </div>

              {/* Delivery Reach Indicator (FR-9) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Delivery Reach:</span>
                  <span className="text-cyan-400 font-bold">On this phone only</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full w-1/3 rounded-full" />
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  Will upgrade to &quot;Reached N devices&quot; and &quot;Reached a coordinator&quot; on physical sync.
                </p>
              </div>

              {/* Category-Specific Escalation Ladder Note (FR-8) */}
              <div className="bg-amber-950/50 border border-amber-700/50 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-amber-300">
                    Automatic Escalation Ladder Active:
                  </span>
                  <span>
                    {category === 'MEDICAL'
                      ? 'Medical priority: Automatically escalates to URGENT at 10m, and CRITICAL at 20m if unacknowledged. Never expires or decays.'
                      : category === 'RESCUE'
                      ? 'Trapped/Rescue priority: Automatically escalates to URGENT at 15m, and CRITICAL at 30m if unacknowledged. Never decays.'
                      : 'General distress: Automatically escalates to URGENT at 30m, and CRITICAL at 60m. Monotonically stored.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleReset}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-sm transition min-h-touch"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Single-Screen Distress Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertOctagon className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-lg font-black tracking-tight text-white">
                  I NEED HELP NOW
                </h2>
                <p className="text-xs text-slate-400">
                  Immediate distress pipeline. Never requires witnesses or corroboration.
                </p>
              </div>
            </div>

            {/* Category selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                What is the immediate emergency?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'RESCUE', label: 'Trapped / Rescue', desc: 'Flooding, collapse' },
                  { id: 'MEDICAL', label: 'Medical Crisis', desc: 'Injury, trauma, vitals' },
                  { id: 'OTHER', label: 'Other Danger', desc: 'Immediate hazard' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id as DistressCategory)}
                    className={`p-3 rounded-xl text-left border transition min-h-touch ${
                      category === item.id
                        ? 'bg-red-950/80 border-red-500 text-white shadow-md shadow-red-950/50'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* People count */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                How many people are in immediate danger?
              </label>
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5, 8].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setPeopleCount(count)}
                    className={`flex-1 py-2.5 rounded-lg font-bold text-sm border min-h-touch ${
                      peopleCount === count
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {count === 8 ? '8+' : count}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Neighborhood
                </label>
                <select
                  value={locationNeighborhood}
                  onChange={(e) => setLocationNeighborhood(e.target.value)}
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
                  Exact Spot / Landmark
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4th St underpass east, apt 2B"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 min-h-touch"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Describe the situation & needs
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Water is waist-high inside ground floor. Elderly person cannot walk. Power is out."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-red-500 placeholder:text-slate-600"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl text-base tracking-wide shadow-xl shadow-red-950 transition active:scale-95 disabled:opacity-50 min-h-touch"
              >
                {isSubmitting ? 'SIGNING & SAVING...' : 'BROADCAST DISTRESS CALL'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
