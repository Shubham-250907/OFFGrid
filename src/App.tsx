import React, { useState } from 'react';
import { useCrisisCache } from './context/CrisisCacheContext';
import { Navbar } from './components/Navbar';
import { DistressModal } from './components/DistressModal';
import { ReportForm } from './components/ReportForm';
import { IncidentList } from './components/IncidentList';
import { HelpHub } from './components/HelpHub';
import { OfflineMap } from './components/OfflineMap';
import { SyncCenter } from './components/SyncCenter';
import { DemoRunner } from './components/DemoRunner';
import { MergeReplayModal } from './components/MergeReplayModal';
import { DistressQueue } from './components/DistressQueue';
import {
  FileText,
  HandHeart,
  Map as MapIcon,
  Radio,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    state,
    isReady,
    mergeReplayDiff,
    dismissMergeReplay,
  } = useCrisisCache();

  const [activeTab, setActiveTab] = useState<'report' | 'help' | 'map' | 'inbox'>('report');
  const [isDistressOpen, setIsDistressOpen] = useState<boolean>(false);
  const [isDemoOpen, setIsDemoOpen] = useState<boolean>(false);
  const [isCommandDensity, setIsCommandDensity] = useState<boolean>(false);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 space-y-3">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="font-mono text-sm tracking-widest text-cyan-400">
          INITIALIZING CRISISCACHE LEDGER...
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans ${isCommandDensity ? 'text-xs' : 'text-sm'}`}>
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openDistressModal={() => setIsDistressOpen(true)}
        openDemoModal={() => setIsDemoOpen(true)}
        isCommandDensity={isCommandDensity}
        setIsCommandDensity={setIsCommandDensity}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 pb-24 md:pb-8">
        {/* Unacknowledged Distress Queue Alert strip */}
        <DistressQueue />

        {/* Tab 1: Reports & Incident Evidence */}
        {activeTab === 'report' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <ReportForm />
            </div>
            <div className="lg:col-span-7">
              <IncidentList
                incidents={state.incidents}
                isCommandDensity={isCommandDensity}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Help & Resource Allocation */}
        {activeTab === 'help' && <HelpHub />}

        {/* Tab 3: Offline Pilot Map */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            <OfflineMap
              incidents={state.incidents}
              distressRequests={state.distressRequests}
            />
          </div>
        )}

        {/* Tab 4: Transport Sync & Audit Ledger */}
        {activeTab === 'inbox' && <SyncCenter />}
      </main>

      {/* Mobile Bottom Navigation Bar (4-tabs per PRD §4.4) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-2 py-1.5 flex items-center justify-around">
        <button
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg min-h-touch ${
            activeTab === 'report' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('help')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg min-h-touch ${
            activeTab === 'help' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <HandHeart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Help</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg min-h-touch ${
            activeTab === 'map' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <MapIcon className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Map</span>
        </button>

        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg min-h-touch ${
            activeTab === 'inbox' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Sync</span>
        </button>
      </nav>

      {/* Floating Emergency Action (Persistent Distress CTA) */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30">
        <button
          onClick={() => setIsDistressOpen(true)}
          className="flex items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-full shadow-2xl shadow-red-950 border-2 border-red-400 transition transform hover:scale-105 active:scale-95"
          title="Immediate Emergency Distress Request"
        >
          <ShieldAlert className="w-5 h-5 animate-pulse" />
          <span className="tracking-wide">I NEED HELP NOW</span>
        </button>
      </div>

      {/* Modals */}
      <DistressModal
        isOpen={isDistressOpen}
        onClose={() => setIsDistressOpen(false)}
      />

      <DemoRunner
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
      />

      {mergeReplayDiff && (
        <MergeReplayModal
          diff={mergeReplayDiff}
          onClose={dismissMergeReplay}
        />
      )}
    </div>
  );
};
