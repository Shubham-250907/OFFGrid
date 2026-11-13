import React, { useState } from 'react';
import {
  QrCode,
  Download,
  Upload,
  Wifi,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  FileText,
  Smartphone,
} from 'lucide-react';
import { useCrisisCache } from '../context/CrisisCacheContext';
import { exportSignedBundle, importSignedBundle } from '../sync/tier0';
import { generateQrSvg } from '../sync/qrCode';
import { Tier1WebRTCSyncManager, WebRTCConnectionState } from '../sync/tier1';

export const SyncCenter: React.FC = () => {
  const {
    deviceId,
    privateKey,
    userRole,
    state,
    ingestExternalEvents,
    deviceLabel,
    replayFromLog,
  } = useCrisisCache();

  const [activeTier, setActiveTier] = useState<'tier0' | 'tier1' | 'receipts'>('tier0');
  const [copied, setCopied] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // WebRTC Tier 1 state
  const [webrtcState, setWebrtcState] = useState<WebRTCConnectionState>('idle');
  const [webrtcDetails, setWebrtcDetails] = useState<string>('');
  const [offerText, setOfferText] = useState<string>('');
  const [answerText, setAnswerText] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [manager] = useState<Tier1WebRTCSyncManager>(
    () =>
      new Tier1WebRTCSyncManager({
        onStateChange: (st, det) => {
          setWebrtcState(st);
          if (det) setWebrtcDetails(det);
        },
        onEventsReceived: (newEvents, sender, isCoord) => {
          ingestExternalEvents(newEvents, sender, isCoord);
        },
      })
  );

  // Export Signed Bundle
  const handleDownloadBundle = () => {
    const jsonStr = exportSignedBundle(
      deviceId,
      state.events,
      userRole === 'COORDINATOR',
      privateKey
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crisiscache-bundle-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Signed Bundle File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const existingIds = new Set<string>(state.events.map((ev: any) => ev.id));
      const res = importSignedBundle(content, existingIds);

      if (res.success) {
        if (res.importedEvents.length > 0) {
          await ingestExternalEvents(res.importedEvents, res.senderDeviceId, res.isCoordinator);
          setImportStatus(
            `Successfully imported ${res.importedEvents.length} new event(s). ${res.alreadyPresentCount} were already known.`
          );
        } else {
          setImportStatus(
            `All ${res.alreadyPresentCount} events in bundle were already in local ledger (no changes needed).`
          );
        }
      } else {
        setImportStatus(`Import Error: ${res.errorMessage}`);
      }
    };
    reader.readAsText(file);
  };

  // WebRTC Actions
  const handleStartHostOffer = async () => {
    manager.init(deviceId, userRole === 'COORDINATOR', privateKey, state.events);
    const offer = await manager.createOffer();
    setOfferText(offer);
  };

  const handleAcceptOfferGenerateAnswer = async () => {
    if (!inputCode.trim()) return;
    manager.init(deviceId, userRole === 'COORDINATOR', privateKey, state.events);
    const ans = await manager.acceptOfferAndCreateAnswer(inputCode.trim());
    setAnswerText(ans);
    setInputCode('');
  };

  const handleApplyAnswer = async () => {
    if (!inputCode.trim()) return;
    await manager.acceptAnswer(inputCode.trim());
    setInputCode('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            <span>Transport Sync & Audit Ledger</span>
          </h2>
          <p className="text-xs text-slate-400">
            Tier 0 (QR / File) and Tier 1 (Local WebRTC Hotspot) honest offline transports.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTier('tier0')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeTier === 'tier0'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tier 0 (QR & Files)
          </button>
          <button
            onClick={() => setActiveTier('tier1')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeTier === 'tier1'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tier 1 (Local WebRTC)
          </button>
          <button
            onClick={() => setActiveTier('receipts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-touch ${
              activeTier === 'receipts'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Delivery Receipts ({state.deliveryReceipts.length})
          </button>
        </div>
      </div>

      {/* TIER 0 SYNC */}
      {activeTier === 'tier0' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Download / Export File Bundle */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Export Signed File Bundle</span>
              </div>
              <p className="text-xs text-slate-400">
                Package all {state.events.length} locally stored events into a content-addressed, Ed25519-signed <code className="text-cyan-300">.json</code> file for transfer via USB, SD card, or local file sharing.
              </p>
              <button
                onClick={handleDownloadBundle}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-2 min-h-touch"
              >
                <Download className="w-4 h-4" />
                <span>Download Signed Bundle ({state.events.length} events)</span>
              </button>
            </div>

            {/* Import File Bundle */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Import Peer File Bundle</span>
              </div>
              <p className="text-xs text-slate-400">
                Read a signed bundle from a peer phone or tablet. All signatures and content hashes are verified before appending to your local ledger.
              </p>
              <label className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer min-h-touch border border-slate-700">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Select .json Bundle File</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {importStatus && (
            <div className="p-3 bg-slate-950 border border-cyan-800/80 rounded-xl text-xs text-cyan-200">
              {importStatus}
            </div>
          )}

          {/* QR Code Manifest representation */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <QrCode className="w-4 h-4 text-cyan-400" />
                <span>Device Manifest QR Code (Tier 0 Handshake)</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {state.events.length} Event Hashes
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Scannable QR representation of your device public key and current event manifest. Peers scan this to verify what events need to be transferred.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-5 pt-2">
              <div
                className="p-3 bg-white rounded-xl shadow-lg shrink-0"
                dangerouslySetInnerHTML={{
                  __html: generateQrSvg(
                    `CRISISCACHE:DEV:${deviceId.slice(0, 16)}:COUNT:${state.events.length}`,
                    160
                  ),
                }}
              />

              <div className="space-y-2 text-xs font-mono text-slate-300 w-full">
                <div>
                  Device ID: <strong className="text-cyan-400">{deviceId.slice(0, 16)}...</strong>
                </div>
                <div>
                  Role: <strong className="text-emerald-400">{userRole}</strong>
                </div>
                <div>
                  Events In Ledger: <strong className="text-white">{state.events.length}</strong>
                </div>
                <div>
                  Active Incidents Projected: <strong className="text-white">{state.incidents.length}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TIER 1 SYNC (Local WebRTC) */}
      {activeTier === 'tier1' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-cyan-400" />
              <span>Tier 1: Direct WebRTC Hotspot Sync (No Internet Required)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Two devices on the same local Wi-Fi router or phone hotspot exchange SDP connection info via QR/text, then open an encrypted DataChannel for automated batch sync.
            </p>
          </div>

          {/* Status */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
            <span>Connection State: <strong className="text-cyan-400 uppercase">{webrtcState}</strong></span>
            {webrtcDetails && <span className="text-slate-400">{webrtcDetails}</span>}
          </div>

          {/* Initiation Workflow */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step A: Host */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div className="font-bold text-xs text-slate-200">
                Option 1: Initiate as Host (Device A)
              </div>
              <p className="text-xs text-slate-400">
                Click to generate a local WebRTC Offer package.
              </p>
              <button
                onClick={handleStartHostOffer}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs min-h-touch"
              >
                Generate Host Offer
              </button>

              {offerText && (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] text-cyan-300 font-bold">Host Offer Package:</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={offerText}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-[10px] font-mono text-slate-400"
                    />
                    <button
                      onClick={() => copyToClipboard(offerText)}
                      className="p-2 bg-slate-800 rounded hover:bg-slate-700"
                      title="Copy Offer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step B: Join */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div className="font-bold text-xs text-slate-200">
                Option 2: Connect or Answer (Device B)
              </div>
              <p className="text-xs text-slate-400">
                Paste the Offer from Device A to generate an Answer, or paste Answer into Device A.
              </p>
              <input
                type="text"
                placeholder="Paste Peer Offer or Answer string here..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleAcceptOfferGenerateAnswer}
                  disabled={!inputCode.trim()}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-cyan-300 font-bold rounded-lg text-xs min-h-touch"
                >
                  Generate Answer
                </button>
                <button
                  onClick={handleApplyAnswer}
                  disabled={!inputCode.trim()}
                  className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold rounded-lg text-xs min-h-touch"
                >
                  Complete Pairing
                </button>
              </div>

              {answerText && (
                <div className="space-y-2 pt-2">
                  <div className="text-[11px] text-emerald-300 font-bold">Answer Package Generated:</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={answerText}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-[10px] font-mono text-slate-400"
                    />
                    <button
                      onClick={() => copyToClipboard(answerText)}
                      className="p-2 bg-slate-800 rounded hover:bg-slate-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELIVERY RECEIPTS TRACKER */}
      {activeTier === 'receipts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Attributable Delivery Receipts (FR-9)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracks the physical store-and-forward propagation of your reports across peer devices and coordinators.
            </p>
          </div>

          {state.deliveryReceipts.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No delivery receipts recorded yet. Receipts update automatically when peers sync with your device.
            </div>
          ) : (
            <div className="space-y-2.5">
              {state.deliveryReceipts.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-white">Target #{rec.id.slice(0, 12)}</div>
                    <div className="text-slate-400 text-[11px]">
                      Reached {rec.reachedDeviceIds.length} peer device(s) • Last synced: {new Date(rec.lastSyncAt).toLocaleTimeString()}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      rec.reachedCoordinator
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {rec.reachedCoordinator ? 'REACHED COORDINATOR' : 'PEER PROPAGATING'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Replay Button */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
        <div className="text-xs text-slate-400">
          <strong className="text-white block">Event Log Invariant Verification:</strong>
          All state projections are pure functions over the local signed event log.
        </div>
        <button
          onClick={replayFromLog}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Replay From Scratch</span>
        </button>
      </div>
    </div>
  );
};
