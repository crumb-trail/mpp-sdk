/**
 * Base64url encode without padding (per RFC 4648 §5).
 */
export function base64urlEncode(data: string | Uint8Array): string {
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode (per RFC 4648 §5).
 */
export function base64urlDecode(encoded: string): string {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

/**
 * Encode a challenge request object to base64url JSON (JCS).
 * For simplicity, uses JSON.stringify with sorted keys.
 */
export function encodeRequest(request: object): string {
  const json = JSON.stringify(request, Object.keys(request).sort());
  return base64urlEncode(json);
}

/**
 * Decode a base64url-encoded request back to an object.
 */
export function decodeRequest<T = unknown>(encoded: string): T {
  return JSON.parse(base64urlDecode(encoded)) as T;
}
