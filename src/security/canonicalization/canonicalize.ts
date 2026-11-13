/**
 * Canonical JSON serialization according to OFFGRID PRD Section 7.1:
 * - Recursively sorted object keys
 * - Stable number serialization
 * - No undefined or null-prototype quirks
 * - UTF-8 binary encoding
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalize(item)).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== undefined) {
      pairs.push(JSON.stringify(key) + ':' + canonicalize(value));
    }
  }

  return '{' + pairs.join(',') + '}';
}

export function canonicalBytes(obj: unknown): Uint8Array {
  const jsonStr = canonicalize(obj);
  return new TextEncoder().encode(jsonStr);
}
