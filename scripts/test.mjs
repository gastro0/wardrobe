// Fail immediately so a later passing script cannot hide an earlier failure.
await import("./test-wardrobe.mjs");
await import("./test-telegram.mjs");
await import("./test-photo-storage.mjs");
await import("./test-weather.mjs");
await import("./test-looks.mjs");
