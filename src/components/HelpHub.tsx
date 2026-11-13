import React, { useState } from 'react';
import {
  HandHeart,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  Truck,
  Droplets,
  Utensils,
  Stethoscope,
  Home,
  Zap,
  Wrench,
  Ban,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import {
  ResourceCategory,
  ResourceRequest,
  ResourceOffer,
  SuggestedMatch,
} from '../types';
import { PILOT_NEIGHBORHOODS } from '../data/pilotNeighborhood';

export const HelpHub: React.FC = () => {
  const {
    state,
    userRole,
    createResourceRequest,
    createResourceOffer,
    triggerResourceMatching,
    approveMatch,
    rejectMatch,
    neighborhood,
  } = useCrisisCache();

  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'offers' | 'matches'>('matches');
  const [showRequestForm, setShowRequestForm] = useState<boolean>(false);
  const [showOfferForm, setShowOfferForm] = useState<boolean>(false);

  // Request form state
  const [reqCategory, setReqCategory] = useState<ResourceCategory>('WATER');
  const [reqQuantity, setReqQuantity] = useState<number>(50);
  const [reqUnit, setReqUnit] = useState<string>('gallons');
  const [reqNeighborhood, setReqNeighborhood] = useState<string>(neighborhood);
  const [reqUrgency, setReqUrgency] = useState<'STANDARD' | 'HIGH' | 'CRITICAL'>('HIGH');

  // Offer form state
  const [offCategory, setOffCategory] = useState<ResourceCategory>('WATER');
  const [offQuantity, setOffQuantity] = useState<number>(100);
  const [offUnit, setOffUnit] = useState<string>('gallons');
  const [offNeighborhood, setOffNeighborhood] = useState<string>(neighborhood);

  const categories: Array<{ id: ResourceCategory; label: string; icon: any }> = [
    { id: 'WATER', label: 'Drinking Water', icon: Droplets },
    { id: 'FOOD', label: 'Food & Meals', icon: Utensils },
    { id: 'MEDICAL', label: 'Medical Supplies', icon: Stethoscope },
    { id: 'SHELTER', label: 'Shelter & Bedding', icon: Home },
    { id: 'POWER', label: 'Power & Fuel', icon: Zap },
    { id: 'TOOLS', label: 'Tools & Hardware', icon: Wrench },
  ];

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    await createResourceRequest({
      category: reqCategory,
      quantity: reqQuantity,
      unit: reqUnit,
      neighborhood: reqNeighborhood,
      urgency: reqUrgency,
    });
    setShowRequestForm(false);
    triggerResourceMatching();
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    await createResourceOffer({
      category: offCategory,
      quantity: offQuantity,
      unit: offUnit,
      neighborhood: offNeighborhood,
    });
    setShowOfferForm(false);
    triggerResourceMatching();
  };

  return (
    <div className="space-y-5 text-slate-100">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <HandHeart className="w-5 h-5 text-cyan-400" />
            <span>Community Aid & Resource Hub</span>
          </h2>
          <p className="text-xs text-slate-400">
            Decentralized supply matching with unit normalization and route blockage awareness.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('matches')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeSubTab === 'matches'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Suggested Matches ({state.suggestedMatches.length})
          </button>
          <button
            onClick={() => setActiveSubTab('requests')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeSubTab === 'requests'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Requests ({state.resourceRequests.length})
          </button>
          <button
            onClick={() => setActiveSubTab('offers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeSubTab === 'offers'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Surplus Offers ({state.resourceOffers.length})
          </button>
        </div>
      </div>

      {/* Concurrent Double-Approval Conflicts Warning (FR-12 & §19) */}
      {state.matchConflicts.length > 0 && (
        <div className="p-4 bg-red-950/70 border-2 border-red-500 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />
            <span>Concurrent Double-Approval Conflict Detected!</span>
          </div>
          <p className="text-xs text-red-200">
            Two partitioned coordinators independently approved allocations that exceed available stock. CrisisCache detected this collision and prevented silent supply exhaustion:
          </p>
          <div className="space-y-1 text-xs font-mono text-red-300 bg-black/40 p-2.5 rounded border border-red-800">
            {state.matchConflicts.map((c, idx) => (
              <div key={idx}>
                Offer #{c.offerId.slice(0, 8)} is over-allocated by {c.overAllocatedAmount} units across {c.conflictingMatchIds.length} match approvals. Please coordinate manually.
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MATCHES VIEW */}
      {activeSubTab === 'matches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Autonomous Greedy Logistics Allocator
            </h3>
            <button
              onClick={triggerResourceMatching}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Re-run Matcher</span>
            </button>
          </div>

          {state.suggestedMatches.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-semibold text-sm">No suggested matches currently pending.</p>
              <p className="text-xs text-slate-500">
                Register requests and offers to let the allocator propose optimal deliveries.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {state.suggestedMatches.map((match) => (
                <div
                  key={match.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-cyan-400" />
                      <span>
                        Match: {match.totalSuggestedQuantity} {match.unit} of {match.category}
                      </span>
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        match.status === 'APPROVED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : match.status === 'REJECTED'
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {match.status}
                    </span>
                  </div>

                  {/* Destination */}
                  <div className="text-xs text-slate-300">
                    Delivering to: <strong className="text-white">{match.requestNeighborhood}</strong> (Requested by #{match.requestId.slice(0, 8)})
                  </div>

                  {/* Contributing Offers */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1 text-xs">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Contributing Source Offers:
                    </div>
                    {match.matches.map((alloc, aIdx) => (
                      <div key={aIdx} className="flex justify-between text-slate-300 font-mono">
                        <span>• From {alloc.offerNeighborhood} (Offer #{alloc.offerId.slice(0, 8)})</span>
                        <span className="text-cyan-400 font-bold">{alloc.quantity} {alloc.unit}</span>
                      </div>
                    ))}
                  </div>

                  {/* Logistics Road Blockage Warning (FR-12 & §9.5) */}
                  {match.logisticsWarning && (
                    <div className="p-2.5 bg-amber-950/70 border border-amber-600/70 rounded-lg text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-amber-300">Logistics Obstruction Warning:</strong>
                        <span>{match.logisticsWarning}</span>
                      </div>
                    </div>
                  )}

                  {/* Approval Actions (Gated by Coordinator Role) */}
                  {match.status === 'PENDING' && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      {userRole === 'COORDINATOR' ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => approveMatch(match.id)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 min-h-touch"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve Allocation</span>
                          </button>
                          <button
                            onClick={() => rejectMatch(match.id)}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition min-h-touch"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Coordinator credential required to lock & approve allocation.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REQUESTS VIEW */}
      {activeSubTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Emergency Aid Requests
            </h3>
            <button
              onClick={() => setShowRequestForm(!showRequestForm)}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 min-h-touch"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>{showRequestForm ? 'Cancel' : 'Post Need'}</span>
            </button>
          </div>

          {showRequestForm && (
            <form onSubmit={handleCreateRequest} className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-white">Request Emergency Resources</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Category</label>
                  <select
                    value={reqCategory}
                    onChange={(e) => setReqCategory(e.target.value as ResourceCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Quantity & Unit</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      value={reqQuantity}
                      onChange={(e) => setReqQuantity(Number(e.target.value))}
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                    />
                    <input
                      type="text"
                      placeholder="gallons, boxes, meals"
                      value={reqUnit}
                      onChange={(e) => setReqUnit(e.target.value)}
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Destination Neighborhood</label>
                  <select
                    value={reqNeighborhood}
                    onChange={(e) => setReqNeighborhood(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                  >
                    {PILOT_NEIGHBORHOODS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Urgency</label>
                  <select
                    value={reqUrgency}
                    onChange={(e) => setReqUrgency(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="HIGH">High Priority</option>
                    <option value="CRITICAL">Critical Life-Safety</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs min-h-touch"
                >
                  Submit Request Event
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-2.5">
            {state.resourceRequests.map((req) => (
              <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">
                    {req.quantity} {req.unit} of {req.category}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px]">
                    Neighborhood: {req.neighborhood} • Fulfilled: {req.fulfilledQuantity} / {req.normalizedQuantity} base units
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OFFERS VIEW */}
      {activeSubTab === 'offers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Surplus Aid Offers
            </h3>
            <button
              onClick={() => setShowOfferForm(!showOfferForm)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 min-h-touch"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>{showOfferForm ? 'Cancel' : 'Register Surplus'}</span>
            </button>
          </div>

          {showOfferForm && (
            <form onSubmit={handleCreateOffer} className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-white">Register Available Surplus</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Category</label>
                  <select
                    value={offCategory}
                    onChange={(e) => setOffCategory(e.target.value as ResourceCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Quantity & Unit</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      value={offQuantity}
                      onChange={(e) => setOffQuantity(Number(e.target.value))}
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                    />
                    <input
                      type="text"
                      placeholder="gallons, boxes, meals"
                      value={offUnit}
                      onChange={(e) => setOffUnit(e.target.value)}
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Current Neighborhood</label>
                  <select
                    value={offNeighborhood}
                    onChange={(e) => setOffNeighborhood(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 min-h-touch"
                  >
                    {PILOT_NEIGHBORHOODS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs min-h-touch"
                >
                  Publish Offer Event
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-2.5">
            {state.resourceOffers.map((off) => (
              <div key={off.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">
                    {off.quantity} {off.unit} of {off.category}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px]">
                    At: {off.neighborhood} • Allocated: {off.allocatedQuantity} / {off.normalizedQuantity} base units
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {off.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
