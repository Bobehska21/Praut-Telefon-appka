import { loadToken } from './token';
import { useMultiplayerStore } from './store';

/** An error answer from the server: `{ error: { code, message, ...extra } }`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (registration only). */
  anonymous?: boolean;
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { serverUrl } = useMultiplayerStore.getState();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
      const { code, message, ...extra } = (error ?? {}) as Record<string, unknown>;
      throw new ApiError(String(code ?? 'unknown'), String(message ?? `HTTP ${response.status}`), response.status, extra);
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Network down, server unreachable or timed out: one stable code the UI can show as "no connection".
    throw new ApiError('network', e instanceof Error ? e.message : 'Network error', 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Authenticated image source for `<Image>` (photos need the bearer token). */
export async function photoSource(photoUrl: string | null): Promise<{ uri: string; headers: Record<string, string> } | null> {
  if (!photoUrl) return null;
  const { serverUrl } = useMultiplayerStore.getState();
  const token = await loadToken();
  return { uri: photoUrl.startsWith('http') ? photoUrl : `${serverUrl}${photoUrl}`, headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

/** Uploads raw image bytes (already resized and JPEG-encoded on the phone). */
export async function uploadPhoto(fileUri: string): Promise<{ photoUrl: string }> {
  const { serverUrl } = useMultiplayerStore.getState();
  const token = await loadToken();
  const file = await fetch(fileUri);
  const blob = await file.blob();
  const response = await fetch(`${serverUrl}/v1/me/photo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: blob,
  });
  const json = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string }; photoUrl?: string } | null;
  if (!response.ok) throw new ApiError(json?.error?.code ?? 'unknown', json?.error?.message ?? `HTTP ${response.status}`, response.status);
  return { photoUrl: json?.photoUrl ?? '' };
}
