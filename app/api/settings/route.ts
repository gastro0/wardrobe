import { z } from "zod";
import { ApiError, body, db, failure, json, protect } from "@/lib/server";

const citySchema = z.object({
  name: z.string().trim().min(1).max(150),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  try {
    const owner = await protect(request);
    const parsed = citySchema.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "Выберите город из списка.");
    const city = parsed.data;
    await db().prepare(
      "INSERT INTO wardrobe_settings (user_id,city,latitude,longitude) VALUES (?,?,?,?) " +
      "ON CONFLICT(user_id) DO UPDATE SET city=excluded.city,latitude=excluded.latitude,longitude=excluded.longitude"
    ).bind(owner, city.name, city.latitude, city.longitude).run();
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
