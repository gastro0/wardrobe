import { z } from "zod";
import { db, user, protect, json, failure, ApiError, body } from "@/lib/server";
import type { Profile } from "@/lib/wardrobe";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  gender: z.enum(["male", "female", "unspecified"]),
});

export async function GET(request: Request) {
  try {
    const profile = await db().prepare("SELECT name, gender FROM wardrobe_profiles WHERE user_id=?")
      .bind(await user(request)).first<Profile>();
    return json({ profile });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const owner = await protect(request);
    const parsed = schema.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "Укажите имя до 60 символов и выберите пол.");
    const profile = parsed.data;
    await db().prepare("INSERT INTO wardrobe_profiles (user_id,name,gender) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,gender=excluded.gender")
      .bind(owner, profile.name, profile.gender).run();
    return json({ profile });
  } catch (error) { return failure(error); }
}
