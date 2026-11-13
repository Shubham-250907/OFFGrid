import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  GitMerge,
  Clock,
  ShieldAlert,
  ArrowRight,
  Eye,
  MessageSquareShare,
  UserCheck,
  X,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import {
  generateElenaPartitionEvents,
  generateDeviceDHearsayEvent,
  generateDeviceEIndependentEvent,
  generateDeviceFContradictionEvent,
  DEMO_PERSONAS,
} from '../data/demoSeeds';

interface DemoRunnerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DemoRunner: React.FC<DemoRunnerProps> = ({ isOpen, onClose }) => {
  const {
    state,
    resetToInitialDemo,
    ingestExternalEvents,
    resolveContradiction,
    claimDemoCoordinatorCredential,
  } = useCrisisCache();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [stepDesc, setStepDesc] = useState<string>('Ready to begin 90-second evidence verification demo.');
  const [elenaReportId, setElenaReportId] = useState<string>('');

  if (!isOpen) return null;

  const handleStep1Reset = async () => {
    await resetToInitialDemo();
    setCurrentStep(1);
    setStepDesc('Base disaster state initialized with active Road Blockage on Market St and Sarah water offer in South Basin.');
  };

  const handleStep2Elena = async () => {
    const baseTime = Date.now() - 3600000;
    const { distressEvent, reportEvent } = generateElenaPartitionEvents(baseTime);
    setElenaReportId(reportEvent.id);

    await ingestExternalEvents(
      [distressEvent, reportEvent],
      DEMO_PERSONAS.ELENA.publicKey,
      false
    );

    setCurrentStep(2);
    setStepDesc('Elena submitted a firsthand Flooding observation and a 3-person Rescue Distress call in Central District.');
  };

  const handleStep3Hearsay = async () => {
    if (!elenaReportId) {
      alert('Please run Step 2 (Elena) first.');
      return;
    }

    const baseTime = Date.now() - 3600000;
    const hearsayEvent = generateDeviceDHearsayEvent(baseTime, elenaReportId);

    await ingestExternalEvents(
      [hearsayEvent],
      DEMO_PERSONAS.DEVICE_D.publicKey,
      false
    );

    setCurrentStep(3);
    setStepDesc('Device D heard the rumor and relayed it as HEARSAY (seenSet contains Elena report). Notice the cluster remains UNVERIFIED with 0 independent witnesses!');
  };

  const handleStep4Independent = async () => {
    const baseTime = Date.now() - 3600000;
    const indepEvent = generateDeviceEIndependentEvent(baseTime);

    await ingestExternalEvents(
      [indepEvent],
      DEMO_PERSONAS.DEVICE_E.publicKey,
      false
    );

    setCurrentStep(4);
    setStepDesc('Device E (independent witness with empty seenSet) submitted a firsthand report. Blind Witness verifies independence and cluster elevates to CORROBORATED (2 independent devices)!');
  };

  const handleStep5PartitionMerge = async () => {
    const baseTime = Date.now() - 3600000;
    const contradictionEvent = generateDeviceFContradictionEvent(baseTime);

    await ingestExternalEvents(
      [contradictionEvent],
      DEMO_PERSONAS.DEVICE_F.publicKey,
      false
    );

    setCurrentStep(5);
    setStepDesc('Bridge opened / Partitions merged! Device F claims underpass is clear. Merge Replay triggers and cluster becomes CONTESTED!');
  };

  const handleStep6CoordinatorResolve = async () => {
    claimDemoCoordinatorCredential();
    const floodIncident = state.incidents.find((i) => i.category === 'FLOODING');
    if (floodIncident) {
      await resolveContradiction(
        floodIncident.id,
        'CERT Commander Vance: Scout verified flood pump drained underpass at 14:30. Roadway safe for transit.'
      );
    }
    setCurrentStep(6);
    setStepDesc('Coordinator Marcus Vance resolved the contradiction with signed attributable reason. Incident is now marked RESOLVED!');
  };

  const steps = [
    {
      num: 1,
      title: 'Reset to Base Disaster State',
      role: 'System',
      action: handleStep1Reset,
      desc: 'Clean baseline with 1 road blockage and 1 water offer.',
    },
    {
      num: 2,
      title: 'Elena Reports Flooding & Distress',
      role: 'Elena (Citizen)',
      action: handleStep2Elena,
      desc: 'Firsthand observation + 3-person Rescue Distress call.',
    },
    {
      num: 3,
      title: 'Device D Relays Hearsay (Rumor Test)',
      role: 'Device D (Neighbor)',
      action: handleStep3Hearsay,
      desc: 'Relays rumor. Cluster stays UNVERIFIED with 0 independent witnesses!',
    },
    {
      num: 4,
      title: 'Device E Corroborates (Blind Witness)',
      role: 'Device E (Witness)',
      action: handleStep4Independent,
      desc: 'Independent firsthand report with clean seenSet flips cluster to CORROBORATED!',
    },
    {
      num: 5,
      title: 'Partition Merge & Contradiction',
      role: 'Device F (Scout)',
      action: handleStep5PartitionMerge,
      desc: 'Network bridge opens -> Merge Replay triggers & flips cluster to CONTESTED!',
    },
    {
      num: 6,
      title: 'Coordinator Vance Resolves Conflict',
      role: 'Marcus Vance',
      action: handleStep6CoordinatorResolve,
      desc: 'Signed attributable resolution sets incident status to RESOLVED.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="text-xs font-mono font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-700">
                90-SECOND VERIFICATION SCRIPT
              </span>
              <h2 className="text-lg font-black text-white mt-0.5">
                Rumor-vs-Witness Scenario Runner
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
          {/* Current progress message */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">
              Current Scenario State:
            </div>
            <p className="text-xs text-amber-200 font-semibold">{stepDesc}</p>
          </div>

          {/* Steps List */}
          <div className="space-y-2.5">
            {steps.map((s) => (
              <div
                key={s.num}
                className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                  currentStep === s.num
                    ? 'bg-amber-950/40 border-amber-500 text-white'
                    : currentStep > s.num
                    ? 'bg-slate-950/60 border-emerald-900/60 text-slate-300'
                    : 'bg-slate-950/30 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      currentStep > s.num
                        ? 'bg-emerald-600 text-white'
                        : currentStep === s.num
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {currentStep > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{s.title}</span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {s.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{s.desc}</p>
                  </div>
                </div>

                <button
                  onClick={s.action}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 min-h-touch ${
                    currentStep === s.num
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  Execute
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleStep1Reset}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-mono"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition min-h-touch"
          >
            Close Runner
          </button>
        </div>
      </div>
    </div>
  );
};
