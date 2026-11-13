import React from 'react';
import {
  ShieldAlert,
  Radio,
  WifiOff,
  UserCheck,
  User,
  SlidersHorizontal,
  PlayCircle,
  Sun,
  Moon,
  KeyRound,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';

interface NavbarProps {
  activeTab: 'report' | 'help' | 'map' | 'inbox';
  setActiveTab: (tab: 'report' | 'help' | 'map' | 'inbox') => void;
  openDistressModal: () => void;
  openDemoModal: () => void;
  isCommandDensity: boolean;
  setIsCommandDensity: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  openDistressModal,
  openDemoModal,
  isCommandDensity,
  setIsCommandDensity,
}) => {
  const {
    userRole,
    setUserRole,
    credential,
    claimDemoCoordinatorCredential,
    revokeCoordinatorCredential,
    deviceLabel,
    neighborhood,
  } = useCrisisCache();

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      {/* Top Banner / Status Strip */}
      <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <WifiOff className="w-3.5 h-3.5" />
            <span>OFFLINE EVIDENCE LAYER</span>
          </span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 hidden sm:inline">
            Zero CDN • Local Ed25519 Ledger
          </span>
        </div>

        <div className="flex items-center gap-2">
          {userRole === 'COORDINATOR' ? (
            <span className="flex items-center gap-1 text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-700/50">
              <UserCheck className="w-3 h-3" />
              <span>COORDINATOR CREDENTIAL VALID</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              <User className="w-3 h-3" />
              <span>CITIZEN MODE</span>
            </span>
          )}

          <button
            onClick={openDemoModal}
            className="flex items-center gap-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-2 py-0.5 rounded border border-amber-500/40 font-medium transition"
            title="Launch 90-Second Rumor-vs-Witness Scenario Demo"
          >
            <PlayCircle className="w-3 h-3" />
            <span className="font-bold">DEMO SCENARIOS</span>
          </button>
        </div>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                CRISISCACHE <span className="text-cyan-400 text-xs font-mono px-1.5 py-0.5 bg-cyan-950 border border-cyan-800 rounded">v2.0</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {deviceLabel} • {neighborhood}
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="hidden md:flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('report')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition min-h-touch ${
              activeTab === 'report'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab('help')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition min-h-touch ${
              activeTab === 'help'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Help & Supplies
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition min-h-touch ${
              activeTab === 'map'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pilot Map
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition min-h-touch ${
              activeTab === 'inbox'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sync & Ledger
          </button>
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Density Preset Toggle */}
          <button
            onClick={() => setIsCommandDensity(!isCommandDensity)}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono flex items-center gap-1.5 border border-slate-700 min-h-touch min-w-touch justify-center"
            title="Toggle Field (Spacious) vs Command (Dense) Preset"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span className="hidden lg:inline">
              {isCommandDensity ? 'Command Density' : 'Field Density'}
            </span>
          </button>

          {/* Role Credential Switcher */}
          {userRole === 'CITIZEN' ? (
            <button
              onClick={claimDemoCoordinatorCredential}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-cyan-800/60 flex items-center gap-1.5 min-h-touch"
              title="Claim pre-signed Coordinator Credential (issued by Anchor)"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Enable Ops Role</span>
            </button>
          ) : (
            <button
              onClick={revokeCoordinatorCredential}
              className="px-2.5 py-1.5 text-xs font-semibold bg-cyan-950 text-cyan-300 rounded-lg border border-cyan-600 flex items-center gap-1.5 min-h-touch"
              title="Return to Citizen Mode"
            >
              <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Coordinator Active</span>
            </button>
          )}

          {/* Distress CTA button */}
          <button
            onClick={openDistressModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-red-950 transition active:scale-95 border border-red-400/50 min-h-touch"
          >
            <ShieldAlert className="w-4 h-4 animate-bounce" />
            <span>I NEED HELP</span>
          </button>
        </div>
      </div>
    </header>
  );
};
