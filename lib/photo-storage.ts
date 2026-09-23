export interface PhotoStorage {
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface SupabaseStorageConfig {
  url: string;
  secretKey: string;
  bucket: string;
}

// Server only: callers must check the Telegram session and photo owner first.
export function createSupabaseStorage(config: SupabaseStorageConfig): PhotoStorage {
  const url = new URL(config.url);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/" ||
      !config.secretKey.startsWith("sb_secret_") || !/^[a-z0-9-]+$/.test(config.bucket)) {
    throw new Error("Invalid photo storage configuration");
  }
  const base = `${url.origin}/storage/v1/object/${config.bucket}`;
  function objectUrl(key: string) {
    if (!/^wardrobe\/[a-zA-Z0-9-]+$/.test(key)) throw new Error("Invalid photo key");
    return `${base}/${key}`;
  }
  async function send(target: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("apikey", config.secretKey);
    // Workers supports manual redirects; never forward the server credential to a redirect target.
    try {
      return await fetch(target, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new Error("Photo storage request failed");
    }
  }
  async function missing(response: Response) {
    if (response.status === 404) return true;
    if (response.status !== 400) return false;
    const error: unknown = await response.json().catch(() => null);
    return typeof error === "object" && error !== null && "code" in error && error.code === "NoSuchKey";
  }
  return {
    async get(key) {
      const response = await send(objectUrl(key));
      if (!response.ok) {
        if (await missing(response)) return null;
        throw new Error(`Photo storage download failed (${response.status})`);
      }
      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (!response.body || !contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        await response.body?.cancel();
        throw new Error("Invalid photo storage response");
      }
      return { body: response.body, httpMetadata: { contentType } };
    },
    async put(key, bytes, options) {
      const response = await send(objectUrl(key), {
        method: "POST", body: new Blob([new Uint8Array(bytes)]),
        headers: { "Content-Type": options.httpMetadata.contentType, "x-upsert": "false", "Cache-Control": "max-age=0" },
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Photo storage upload failed (${response.status})`);
    },
    async delete(key) {
      objectUrl(key);
      const response = await send(base, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [key] }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Photo storage deletion failed (${response.status})`);
    },
  };
}
