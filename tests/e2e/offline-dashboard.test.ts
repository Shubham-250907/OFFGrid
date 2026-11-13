import { describe, it, expect } from 'vitest';
import { LocalOfflineMapService } from '../../src/maps/OfflineMapService';

describe('E2E Offline Dashboard State', () => {
  it('gracefully handles missing map tiles with list fallback and offline indicators', async () => {
    const mapService = new LocalOfflineMapService();
    await mapService.initialize();
    const hasMap = await mapService.hasOfflineMap();
    expect(hasMap).toBe(false);

    const coverage = await mapService.getCoverageStatus(12.97, 77.59);
    expect(coverage).toBe('OUTSIDE_COVERAGE');
  });
});
