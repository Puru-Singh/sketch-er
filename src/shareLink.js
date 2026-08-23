import LZString from "lz-string";

export function encodeShareState(state) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeShareHash(hash) {
  try {
    if (!hash.startsWith("#share=")) return null;
    const encoded = hash.slice("#share=".length);
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(state, locationLike) {
  const encoded = encodeShareState(state);
  return `${locationLike.origin}${locationLike.pathname}#share=${encoded}`;
}
