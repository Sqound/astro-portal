// Integer-only FNV-1a over UTF-16 code units, followed by xorshift32.
// Each state is masked to 0xffffffff and shifts are unsigned.
export function hashSuggestionSeed(seed) {
  const text = String(seed ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

export function createSuggestionRandom(seed) {
  let state = hashSuggestionSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

// JSON-in/JSON-out adapter.
export function suggestionRandomValues(seed, count) {
  const next = createSuggestionRandom(seed);
  return Array.from({ length: count }, () => next());
}

export function suggestionSeed({ date, latitude, longitude, tier } = {}) {
  const base = `${date}|${Number(latitude).toFixed(2)}|${Number(longitude).toFixed(2)}`;
  return tier === undefined || tier === null ? base : `${base}|${tier}`;
}
