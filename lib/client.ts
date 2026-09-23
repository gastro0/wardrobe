export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error("Сервис временно недоступен. Попробуйте ещё раз."); }
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data &&
      typeof data.error === "string" ? data.error : "Не удалось выполнить действие.";
    throw new Error(message);
  }
  return data as T;
}
