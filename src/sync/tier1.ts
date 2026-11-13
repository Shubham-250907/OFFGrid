import { Event, SyncManifest, EventBatch, SyncAck } from '../types';
import {
  createSyncManifest,
  verifySyncManifest,
  reconcileEventIds,
  createEventBatches,
  verifyAndFilterIncomingBatch,
} from './protocol';
import { sign } from '../crypto/ed25519';

export type WebRTCConnectionState =
  | 'idle'
  | 'generating_offer'
  | 'waiting_for_answer'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'completed'
  | 'failed';

export interface WebRTCMessage {
  type: 'manifest' | 'batch' | 'ack';
  payload: any;
}

export class Tier1WebRTCSyncManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localEvents: Event[] = [];
  private deviceId: string = '';
  private isCoordinator: boolean = false;
  private privateKeyHex: string = '';
  private onStateChange: (state: WebRTCConnectionState, details?: string) => void;
  private onEventsReceived: (events: Event[], senderId: string, isCoord: boolean) => void;
  private localOfferString: string = '';
  private localAnswerString: string = '';

  constructor(callbacks: {
    onStateChange: (state: WebRTCConnectionState, details?: string) => void;
    onEventsReceived: (events: Event[], senderId: string, isCoord: boolean) => void;
  }) {
    this.onStateChange = callbacks.onStateChange;
    this.onEventsReceived = callbacks.onEventsReceived;
  }

  public init(
    deviceId: string,
    isCoordinator: boolean,
    privateKeyHex: string,
    localEvents: Event[]
  ) {
    this.deviceId = deviceId;
    this.isCoordinator = isCoordinator;
    this.privateKeyHex = privateKeyHex;
    this.localEvents = localEvents;
  }

  /**
   * Device A: Create Offer
   */
  public async createOffer(): Promise<string> {
    this.cleanup();
    this.onStateChange('generating_offer', 'Creating local peer connection...');

    // Standard local-only ICE configuration (no external STUN/TURN servers needed for co-located local LAN)
    const config: RTCConfiguration = {
      iceServers: [],
    };

    this.pc = new RTCPeerConnection(config);

    // Create DataChannel
    this.dc = this.pc.createDataChannel('crisiscache_sync', {
      ordered: true,
    });
    this.setupDataChannel(this.dc);

    const iceCandidates: RTCIceCandidateInit[] = [];
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate.toJSON());
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait briefly for local network ICE candidates to gather
    await new Promise((resolve) => setTimeout(resolve, 800));

    const packageData = {
      type: 'OFFER',
      sdp: this.pc.localDescription,
      candidates: iceCandidates,
    };

    this.localOfferString = btoa(JSON.stringify(packageData));
    this.onStateChange('waiting_for_answer', 'Show this Offer QR code to Peer B.');
    return this.localOfferString;
  }

  /**
   * Device B: Accept Offer and generate Answer
   */
  public async acceptOfferAndCreateAnswer(offerB64: string): Promise<string> {
    this.cleanup();
    this.onStateChange('connecting', 'Parsing peer offer...');

    const packageData = JSON.parse(atob(offerB64));
    this.pc = new RTCPeerConnection({ iceServers: [] });

    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };

    const iceCandidates: RTCIceCandidateInit[] = [];
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate.toJSON());
      }
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(packageData.sdp));

    // Add candidates from offer
    if (packageData.candidates) {
      for (const cand of packageData.candidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('ICE candidate add error:', e);
        }
      }
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait briefly for local ICE candidates
    await new Promise((resolve) => setTimeout(resolve, 800));

    const answerPackage = {
      type: 'ANSWER',
      sdp: this.pc.localDescription,
      candidates: iceCandidates,
    };

    this.localAnswerString = btoa(JSON.stringify(answerPackage));
    this.onStateChange('waiting_for_answer', 'Show this Answer QR code to Peer A.');
    return this.localAnswerString;
  }

  /**
   * Device A: Accept Answer from Device B to complete handshake
   */
  public async acceptAnswer(answerB64: string): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    this.onStateChange('connecting', 'Connecting peer channel...');

    const packageData = JSON.parse(atob(answerB64));
    await this.pc.setRemoteDescription(new RTCSessionDescription(packageData.sdp));

    if (packageData.candidates) {
      for (const cand of packageData.candidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('ICE candidate error:', e);
        }
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.onStateChange('connected', 'Peer channel established. Initiating manifest exchange...');
      this.sendManifest();
    };

    channel.onmessage = (event) => {
      try {
        const msg: WebRTCMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('Error handling DataChannel message:', err);
      }
    };

    channel.onerror = (err) => {
      console.error('DataChannel error:', err);
      this.onStateChange('failed', 'WebRTC DataChannel error');
    };

    channel.onclose = () => {
      this.onStateChange('completed', 'Sync session closed.');
    };
  }

  private sendManifest() {
    const manifest = createSyncManifest(
      this.deviceId,
      this.localEvents,
      this.isCoordinator,
      this.privateKeyHex,
      sign
    );
    this.sendMessage({ type: 'manifest', payload: manifest });
  }

  private handleMessage(msg: WebRTCMessage) {
    switch (msg.type) {
      case 'manifest': {
        const remoteManifest = msg.payload as SyncManifest;
        const valid = verifySyncManifest(remoteManifest);
        if (!valid) {
          this.onStateChange('failed', 'Untrusted remote manifest signature');
          return;
        }

        const localIds = this.localEvents.map((e) => e.id);
        const { missingFromRemote } = reconcileEventIds(localIds, remoteManifest.eventIds);

        // Send missing events that remote needs
        const eventsToSend = this.localEvents.filter((e) => missingFromRemote.includes(e.id));
        if (eventsToSend.length > 0) {
          const batches = createEventBatches(eventsToSend, this.deviceId);
          for (const batch of batches) {
            this.sendMessage({ type: 'batch', payload: batch });
          }
        }
        break;
      }

      case 'batch': {
        const batch = msg.payload as EventBatch;
        const { validEvents, rejectedCount } = verifyAndFilterIncomingBatch(batch);

        if (validEvents.length > 0) {
          this.onEventsReceived(validEvents, batch.senderDeviceId, false);
          // Send Ack
          const ack: SyncAck = {
            receiverDeviceId: this.deviceId,
            receivedEventIds: validEvents.map((e) => e.id),
            isCoordinator: this.isCoordinator,
          };
          this.sendMessage({ type: 'ack', payload: ack });
        }

        this.onStateChange(
          'syncing',
          `Batch ${batch.batchIndex + 1}/${batch.totalBatches} applied (${validEvents.length} events)`
        );
        break;
      }

      case 'ack': {
        const ack = msg.payload as SyncAck;
        this.onStateChange(
          'completed',
          `Sync complete. Remote acknowledged ${ack.receivedEventIds.length} events.`
        );
        break;
      }
    }
  }

  private sendMessage(msg: WebRTCMessage) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(msg));
    }
  }

  public cleanup() {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.localOfferString = '';
    this.localAnswerString = '';
  }
}
