import { z } from "zod";
import { ApiError, failure, json, user } from "@/lib/server";

const responseSchema = z.object({
  results: z.array(z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    country: z.string().nullish(),
    admin1: z.string().nullish(),
  })).nullish(),
});

export async function GET(request: Request) {
  try {
    await user(request);
    const name = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (name.length < 2) return json({ cities: [] });
    if (name.length > 120) throw new ApiError(400, "Слишком длинное название города.");
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({ name, count: "8", language: "ru", format: "json" }).toString();
    const result = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!result.ok) {
      throw new ApiError(503, "Поиск городов временно недоступен. Попробуйте ещё раз.");
    }
    const data = responseSchema.parse(await result.json());
    return json({ cities: (data.results ?? []).map(city => ({
      name: city.name, latitude: city.latitude, longitude: city.longitude,
      country: city.country, admin1: city.admin1,
    })) });
  } catch (error) { return failure(error); }
}
