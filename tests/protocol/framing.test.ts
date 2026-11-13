import { describe, it, expect } from 'vitest';
import {
  splitIntoFrames,
  parseFrame,
  FrameAssembler,
  DEFAULT_CHUNK_SIZE
} from '../../src/mesh/protocol/framing';

describe('BLE Packet Framing and Reassembly', () => {
  it('splits single small payload into 1 frame and parses header', () => {
    const payload = new TextEncoder().encode('Hello OFFGRID');
    const frames = splitIntoFrames('small-pkt-1', payload);

    expect(frames).toHaveLength(1);
    const parsed = parseFrame(frames[0]!);
    expect(parsed).not.toBeNull();
    expect(parsed?.header.magic).toBe('OFF1');
    expect(parsed?.header.packetId).toBe('small-pkt-1');
    expect(parsed?.header.chunkIndex).toBe(0);
    expect(parsed?.header.totalChunks).toBe(1);
    expect(new TextDecoder().decode(parsed?.chunkData)).toBe('Hello OFFGRID');
  });

  it('splits large 2 KB payload across multiple frames within MTU boundaries', () => {
    // Generate 2048 bytes of test data
    const payload = new Uint8Array(2048);
    for (let i = 0; i < 2048; i++) {
      payload[i] = i % 256;
    }

    const frames = splitIntoFrames('large-pkt-2', payload, DEFAULT_CHUNK_SIZE);
    const expectedChunks = Math.ceil(2048 / DEFAULT_CHUNK_SIZE); // ceil(2048 / 460) = 5
    expect(frames.length).toBe(expectedChunks);

    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(DEFAULT_CHUNK_SIZE + 46); // Less than 512 MTU
      const parsed = parseFrame(frame);
      expect(parsed).not.toBeNull();
      expect(parsed?.header.totalChunks).toBe(expectedChunks);
    }
  });

  it('reassembles out-of-order received frames bit-for-bit into original payload', () => {
    const payload = new TextEncoder().encode('The quick brown fox jumps over the lazy dog repeatedly to test framing.');
    const chunkSize = 20; // Force multiple small chunks
    const frames = splitIntoFrames('scramble-pkt', payload, chunkSize);

    expect(frames.length).toBeGreaterThan(2);

    const assembler = new FrameAssembler();

    // Ingest frames out of order (e.g. reverse order)
    let finalResult: { packetId: string; payload: Uint8Array } | null = null;
    for (let i = frames.length - 1; i >= 0; i--) {
      const res = assembler.ingestFrame(frames[i]!);
      if (res) {
        finalResult = res;
      }
    }

    expect(finalResult).not.toBeNull();
    expect(finalResult?.packetId).toBe('scramble-pkt');
    expect(finalResult?.payload).toEqual(payload);
    expect(new TextDecoder().decode(finalResult?.payload)).toBe(
      'The quick brown fox jumps over the lazy dog repeatedly to test framing.'
    );
  });
});
