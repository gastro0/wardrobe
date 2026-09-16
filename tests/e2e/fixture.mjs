import {access} from "node:fs/promises";
import {chromium} from "playwright-core";

export async function launchBrowser() {
  const candidates = [process.env.E2E_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
  for (const executablePath of candidates) {
    try { await access(executablePath); } catch { continue; }
    return chromium.launch({executablePath, headless: true});
  }
  throw new Error("Set E2E_BROWSER to an installed Chromium browser executable.");
}

export async function mockWardrobe(page, {failWeather = false, failSave = false, gender = "unspecified"} = {}) {
  const garment = (id, name, category, image, tags = []) => ({id, name, category, tags, image: `/images/${image}`, color: "Белый", minTemp: -30, maxTemp: 40, rainproof: true, windproof: true});
  const state = {
    profile: {name: "Тест", gender},
    city: {name: "Москва", latitude: 55.75222, longitude: 37.61556},
    items: [
      garment("tee", "Молочная футболка", "tshirt", "cream-tshirt.jpg"),
      garment("shirt", "Голубая рубашка", "shirt", "blue-shirt.jpg"),
      garment("jeans", "Прямые джинсы", "jeans", "dark-jeans.jpg"),
      garment("coat", "Оливковая куртка", "outerwear", "olive-jacket.png"),
      garment("shoes", "Белые кеды", "shoes", "white-sneakers.jpg"),
      garment("bag", "Чёрная сумка", "accessory", "black-tote.jpg"),
      garment("hat", "Любимая шапка", "accessory", "black-tote.jpg", ["Шапка"]),
    ],
    outfits: [{id: "saved", name: "На каждый день", itemIds: ["tee", "jeans", "coat", "shoes", "bag", "hat"], createdAt: "2026-09-16T12:00:00Z"}],
  };
  const conditions = {temperature: 20, feels: 20, code: 0, wind: 2, rain: 0, probability: 0, isDay: true};
  const weather = {current: conditions, days: [0, 1].map(offset => ({date: `2026-09-${16 + offset}`, min: 15, max: 20, ...conditions})), timezone: "Europe/Moscow", time: "2026-09-16T12:00", fetchedAt: new Date().toISOString(), source: "open-meteo"};
  // Every API request is intercepted. Tests never read or mutate the user's DB.
  await page.route("**/api/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const send = (json, status = 200) => route.fulfill({status, json});
    if (pathname === "/api/wardrobe" && method === "GET") return send(state);
    if (pathname === "/api/weather" && method === "GET") {
      if (failWeather) { failWeather = false; return send({error: "Тестовая ошибка погоды"}, 503); }
      return send(weather);
    }
    if (pathname === "/api/outfits" && method === "POST") {
      if (failSave) { failSave = false; return send({error: "Тестовая ошибка сохранения"}, 503); }
      const data = request.postDataJSON();
      const outfit = {...data, id: data.id ?? crypto.randomUUID(), createdAt: new Date().toISOString()};
      state.outfits = [outfit, ...state.outfits.filter(old => old.id !== outfit.id)];
      return send({outfit});
    }
    if (pathname === "/api/outfits" && method === "DELETE") {
      state.outfits = state.outfits.filter(outfit => outfit.id !== request.postDataJSON().id);
      return send({ok: true});
    }
    return send({error: `Unexpected test request: ${method} ${pathname}`}, 501);
  });
  return state;
}
