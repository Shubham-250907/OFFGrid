/**
 * OFFGRID BLE Framing Sublayer
 * Handles packet chunking and deterministic reassembly across BLE MTU boundaries (512-byte ATT limits).
 */

const FRAME_MAGIC = new Uint8Array([0x4F, 0x46, 0x46, 0x31]); // 'OFF1'
export const DEFAULT_CHUNK_SIZE = 180; // Safe payload size below 512 MTU with header overhead

export interface FrameHeader {
  magic: string;
  packetId: string;
  chunkIndex: number;
  totalChunks: number;
  payloadLength: number;
}

export function splitIntoFrames(
  packetId: string,
  payload: Uint8Array,
  chunkSize = DEFAULT_CHUNK_SIZE
): Uint8Array[] {
  const totalChunks = Math.ceil(payload.length / chunkSize) || 1;
  const frames: Uint8Array[] = [];

  const encoder = new TextEncoder();
  const packetIdBytes = encoder.encode(packetId.padEnd(36, ' ').slice(0, 36));

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, payload.length);
    const chunkData = payload.slice(start, end);

    // Frame buffer: 4 bytes Magic + 36 bytes PacketId + 2 bytes Index + 2 bytes Total + 2 bytes Length + Chunk
    const frame = new Uint8Array(4 + 36 + 2 + 2 + 2 + chunkData.length);
    const view = new DataView(frame.buffer);

    // Magic
    frame.set(FRAME_MAGIC, 0);
    // Packet ID
    frame.set(packetIdBytes, 4);
    // Chunk Index
    view.setUint16(40, i, false);
    // Total Chunks
    view.setUint16(42, totalChunks, false);
    // Payload Length
    view.setUint16(44, chunkData.length, false);
    // Payload Data
    frame.set(chunkData, 46);

    frames.push(frame);
  }

  return frames;
}

export function parseFrame(frameBytes: Uint8Array): {
  header: FrameHeader;
  chunkData: Uint8Array;
} | null {
  if (frameBytes.length < 46) {
    return null;
  }

  // Check Magic 'OFF1'
  if (
    frameBytes[0] !== FRAME_MAGIC[0] ||
    frameBytes[1] !== FRAME_MAGIC[1] ||
    frameBytes[2] !== FRAME_MAGIC[2] ||
    frameBytes[3] !== FRAME_MAGIC[3]
  ) {
    return null;
  }

  const decoder = new TextDecoder();
  const packetId = decoder.decode(frameBytes.slice(4, 40)).trim();

  const view = new DataView(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength);
  const chunkIndex = view.getUint16(40, false);
  const totalChunks = view.getUint16(42, false);
  const payloadLength = view.getUint16(44, false);

  if (frameBytes.length < 46 + payloadLength) {
    return null;
  }

  const chunkData = frameBytes.slice(46, 46 + payloadLength);

  return {
    header: {
      magic: 'OFF1',
      packetId,
      chunkIndex,
      totalChunks,
      payloadLength
    },
    chunkData
  };
}

export class FrameAssembler {
  private assemblies = new Map<
    string,
    {
      totalChunks: number;
      receivedChunks: Map<number, Uint8Array>;
      receivedAt: number;
    }
  >();

  private expiryMs: number;

  constructor(expiryMs = 30000) {
    this.expiryMs = expiryMs;
  }

  /**
   * Ingests a frame chunk. Returns the full reconstructed payload if all frames are present.
   */
  ingestFrame(frameBytes: Uint8Array): { packetId: string; payload: Uint8Array } | null {
    this.cleanExpired();

    const parsed = parseFrame(frameBytes);
    if (!parsed) return null;

    const { header, chunkData } = parsed;
    const { packetId, chunkIndex, totalChunks } = header;

    if (totalChunks === 1) {
      return { packetId, payload: chunkData };
    }

    let assembly = this.assemblies.get(packetId);
    if (!assembly) {
      assembly = {
        totalChunks,
        receivedChunks: new Map(),
        receivedAt: Date.now()
      };
      this.assemblies.set(packetId, assembly);
    }

    assembly.receivedChunks.set(chunkIndex, chunkData);

    if (assembly.receivedChunks.size === totalChunks) {
      // Reassemble complete buffer
      let totalLength = 0;
      for (let i = 0; i < totalChunks; i++) {
        const chunk = assembly.receivedChunks.get(i);
        if (!chunk) return null; // Missing frame
        totalLength += chunk.length;
      }

      const completePayload = new Uint8Array(totalLength);
      let offset = 0;
      for (let i = 0; i < totalChunks; i++) {
        const chunk = assembly.receivedChunks.get(i)!;
        completePayload.set(chunk, offset);
        offset += chunk.length;
      }

      this.assemblies.delete(packetId);
      return { packetId, payload: completePayload };
    }

    return null;
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [id, assembly] of this.assemblies.entries()) {
      if (now - assembly.receivedAt > this.expiryMs) {
        this.assemblies.delete(id);
      }
    }
  }
}
