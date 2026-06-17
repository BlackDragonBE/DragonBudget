// Thin fetch wrapper around the JSON API. No react-query yet — add when manual
// refetch/caching coordination measurably hurts.
export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  if (res.status === 401) {
    // Session expired or not logged in — reload so the auth gate shows the login.
    window.location.reload();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}
