export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OfflineMapService {
  initialize(): Promise<void>;
  hasOfflineMap(): Promise<boolean>;
  loadMap(uri: string): Promise<void>;
  getMapBounds(): Promise<MapBounds | null>;
  getCoverageStatus(
    latitude: number,
    longitude: number
  ): Promise<'COVERED' | 'OUTSIDE_COVERAGE'>;
}

export class LocalOfflineMapService implements OfflineMapService {
  private loaded = false;
  private currentBounds: MapBounds | null = null;

  async initialize(): Promise<void> {
    this.loaded = false;
  }

  async hasOfflineMap(): Promise<boolean> {
    return this.loaded;
  }

  async loadMap(uri: string): Promise<void> {
    if (!uri) throw new Error('Invalid MBTiles URI');
    this.loaded = true;
  }

  async getMapBounds(): Promise<MapBounds | null> {
    return this.currentBounds;
  }

  async getCoverageStatus(
    latitude: number,
    longitude: number
  ): Promise<'COVERED' | 'OUTSIDE_COVERAGE'> {
    if (!this.loaded || !this.currentBounds) {
      return 'OUTSIDE_COVERAGE';
    }
    const { north, south, east, west } = this.currentBounds;
    if (
      latitude <= north &&
      latitude >= south &&
      longitude <= east &&
      longitude >= west
    ) {
      return 'COVERED';
    }
    return 'OUTSIDE_COVERAGE';
  }
}
