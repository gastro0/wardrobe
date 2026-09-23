import { z } from "zod";
import {
  categoryAllowed, categoryKeys, MAX_ITEM_TAGS, MAX_TAG_LENGTH,
  normalizeCategory, normalizeTags, type Category, type Profile,
} from "@/lib/wardrobe";
import { ApiError, body, bucket, db, failure, json, protect, user } from "@/lib/server";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(categoryKeys).transform(normalizeCategory),
  color: z.string().max(30),
  tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
    .max(MAX_ITEM_TAGS).transform(normalizeTags).optional(),
  minTemp: z.number().int().min(-50).max(50),
  maxTemp: z.number().int().min(-50).max(50),
  rainproof: z.boolean(),
  windproof: z.boolean(),
}).refine(item => item.minTemp <= item.maxTemp);

type ItemInput = z.infer<typeof itemSchema>;
type ItemRow = {
  id: string; name: string; category: Category; color: string; tags: string;
  min_temp: number; max_temp: number; rainproof: number; windproof: number;
  created_at: string;
};
type OutfitRow = { id: string; name: string; item_ids: string; created_at: string };
type CityRow = { city: string; latitude: number; longitude: number };

function itemResponse(row: ItemRow) {
  return {
    id: row.id, name: row.name, category: normalizeCategory(row.category),
    color: row.color, tags: JSON.parse(row.tags ?? "[]"),
    minTemp: row.min_temp, maxTemp: row.max_temp,
    rainproof: !!row.rainproof, windproof: !!row.windproof,
    image: `/api/images/${row.id}`, createdAt: row.created_at,
  };
}

async function checkProfile(owner: string, category: ItemInput["category"]) {
  const profile = await db().prepare("SELECT name,gender FROM wardrobe_profiles WHERE user_id=?")
    .bind(owner).first<Profile>();
  if (!profile) throw new ApiError(400, "Сначала заполните профиль.");
  if (!categoryAllowed(category, profile.gender)) {
    throw new ApiError(400, "Эта категория недоступна для выбранного пола в профиле.");
  }
}

function imageType(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function GET(request: Request) {
  try {
    const owner = await user(request);
    const database = db();
    const [itemsResult, outfitsResult, cityResult, profileResult] = await database.batch([
      database.prepare("SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY created_at DESC").bind(owner),
      database.prepare("SELECT * FROM outfits WHERE user_id = ? ORDER BY created_at DESC").bind(owner),
      database.prepare("SELECT * FROM wardrobe_settings WHERE user_id = ?").bind(owner),
      database.prepare("SELECT name,gender FROM wardrobe_profiles WHERE user_id = ?").bind(owner),
    ]);
    // These rows come from the fixed SELECT projections above.
    const items = (itemsResult.results as ItemRow[]).map(itemResponse);
    const outfits = (outfitsResult.results as OutfitRow[]).map(row => ({
      id: row.id, name: row.name, itemIds: JSON.parse(row.item_ids), createdAt: row.created_at,
    }));
    const savedCity = (cityResult.results as CityRow[])[0];
    return json({
      profile: profileResult.results[0] ?? null,
      items, outfits,
      city: savedCity ? { name: savedCity.city, latitude: savedCity.latitude, longitude: savedCity.longitude } : null,
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  let key: string | undefined;
  let uploaded = false;
  try {
    const owner = await protect(request);
    if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024) {
      throw new ApiError(413, "Фото должно быть меньше 8 МБ.");
    }
    const form = await request.formData();
    const parsed = itemSchema.safeParse(JSON.parse(String(form.get("data"))));
    if (!parsed.success) throw new ApiError(400, "Проверьте название, теги и диапазон температуры.");
    await checkProfile(owner, parsed.data.category);

    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size) throw new ApiError(400, "Добавьте фотографию вещи.");
    if (photo.size > 8 * 1024 * 1024) throw new ApiError(413, "Фото должно быть меньше 8 МБ.");
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const type = imageType(bytes);
    if (!type) throw new ApiError(400, "Выберите фото JPG, PNG или WebP.");

    const id = crypto.randomUUID();
    key = `wardrobe/${id}`;
    const data = { ...parsed.data, tags: parsed.data.tags ?? [] };
    const now = new Date().toISOString();
    await bucket().put(key, bytes, { httpMetadata: { contentType: type } });
    uploaded = true;
    await db().prepare("INSERT INTO wardrobe_items (id,user_id,name,category,color,min_temp,max_temp,rainproof,windproof,image_key,created_at,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, owner, data.name, data.category, data.color, data.minTemp, data.maxTemp,
        Number(data.rainproof), Number(data.windproof), key, now, JSON.stringify(data.tags)).run();
    return json({ item: { id, ...data, image: `/api/images/${id}`, createdAt: now } }, 201);
  } catch (error) {
    if (key && uploaded) {
      try { await bucket().delete(key); }
      catch (cleanupError) { console.error("Image cleanup failed", cleanupError); }
    }
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await protect(request);
    const payload = await body(request);
    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success || typeof payload.id !== "string") {
      throw new ApiError(400, "Проверьте название, теги и диапазон температуры.");
    }
    const item = parsed.data;
    await checkProfile(owner, item.category);
    const result = await db().prepare("UPDATE wardrobe_items SET name=?,category=?,color=?,min_temp=?,max_temp=?,rainproof=?,windproof=?,tags=COALESCE(?,tags) WHERE id=? AND user_id=?")
      .bind(item.name, item.category, item.color, item.minTemp, item.maxTemp,
        Number(item.rainproof), Number(item.windproof),
        item.tags === undefined ? null : JSON.stringify(item.tags), payload.id, owner).run();
    if (!result.meta.changes) throw new ApiError(404, "Вещь не найдена.");
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const owner = await protect(request);
    const { id } = await body(request);
    if (typeof id !== "string") throw new ApiError(400, "Выберите вещь.");
    const item = await db().prepare("SELECT image_key FROM wardrobe_items WHERE id=? AND user_id=?")
      .bind(id, owner).first<{ image_key: string }>();
    if (!item) throw new ApiError(404, "Вещь не найдена.");
    await db().prepare("DELETE FROM wardrobe_items WHERE id=? AND user_id=?").bind(id, owner).run();
    try { await bucket().delete(item.image_key); }
    catch (error) { console.error("Orphaned image cleanup failed", error); }
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
