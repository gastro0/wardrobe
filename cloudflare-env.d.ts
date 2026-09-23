declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PHOTO_STORAGE?: string;
    SUPABASE_URL?: string;
    SUPABASE_SECRET_KEY?: string;
    SUPABASE_STORAGE_BUCKET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_BOT_USERNAME?: string;
    TELEGRAM_OWNER_ID?: string;
    ALLOW_LOCAL_DEVELOPMENT?: string;
  }
}
