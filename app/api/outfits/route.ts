import { z } from "zod";
import { categoryAllowed, type Category, type Profile } from "@/lib/wardrobe";
import { ApiError, body, db, failure, json, protect } from "@/lib/server";

const outfitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  itemIds: z.array(z.string().uuid()).min(1).max(30),
  id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const owner = await protect(request);
    const parsed = outfitSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "Добавьте вещи и название образа.");
    const outfit = parsed.data;
    const ids = [...new Set(outfit.itemIds)];
    const found = await db().prepare(
      `SELECT id,category FROM wardrobe_items WHERE user_id=? AND id IN (${ids.map(() => "?").join(",")})`
    ).bind(owner, ...ids).all<{ id: string; category: Category }>();
    if (found.results.length !== ids.length) {
      throw new ApiError(400, "Одна из вещей уже удалена. Обновите гардероб.");
    }

    const profile = await db().prepare("SELECT name,gender FROM wardrobe_profiles WHERE user_id=?")
      .bind(owner).first<Profile>();
    if (!profile) throw new ApiError(400, "Сначала заполните профиль.");
    if (found.results.some(item => !categoryAllowed(item.category, profile.gender))) {
      throw new ApiError(400, "В образе есть вещи из категорий, скрытых в вашем профиле.");
    }

    const id = outfit.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    if (outfit.id) {
      const result = await db().prepare("UPDATE outfits SET name=?,item_ids=? WHERE id=? AND user_id=?")
        .bind(outfit.name, JSON.stringify(ids), id, owner).run();
      if (!result.meta.changes) throw new ApiError(404, "Образ не найден.");
    } else {
      await db().prepare("INSERT INTO outfits (id,user_id,name,item_ids,created_at) VALUES (?,?,?,?,?)")
        .bind(id, owner, outfit.name, JSON.stringify(ids), now).run();
    }
    return json({ outfit: { id, name: outfit.name, itemIds: ids, createdAt: now } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const owner = await protect(request);
    const { id } = await body(request);
    if (typeof id !== "string") throw new ApiError(400, "Выберите образ.");
    await db().prepare("DELETE FROM outfits WHERE id=? AND user_id=?").bind(id, owner).run();
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
