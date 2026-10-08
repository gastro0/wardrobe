import {access} from "node:fs/promises";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";

export async function launchBrowser() {
  const candidates = [process.env.E2E_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", chromium.executablePath(), "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
  for (const executablePath of candidates) {
    try { await access(executablePath); } catch { continue; }
    return chromium.launch({executablePath, headless: true});
  }
  throw new Error("Set E2E_BROWSER to an installed Chromium browser executable.");
}

export async function mockWardrobe(page, {failWeather = false, failSave = false, failUpload = false, failReplacement = false, gender = "unspecified", newProfile = false, loginState = "ready"} = {}) {
  const photos = new Map();
  const pendingPhotos = new Map();
  // Chromium omits multipart file bytes from intercepted request postData.
  // Capture the actual File in the page and correlate it with its API request.
  await page.exposeBinding("__captureWardrobePhoto", (_source, {key, bytes, contentType}) => {
    pendingPhotos.set(key, {body: Buffer.from(bytes), contentType});
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      if (url.pathname !== "/api/wardrobe" || !(init?.body instanceof FormData)) {
        return originalFetch(input, init);
      }
      const photo = init.body.get("photo");
      if (!(photo instanceof File)) return originalFetch(input, init);
      const key = crypto.randomUUID();
      await window.__captureWardrobePhoto({
        key, bytes: [...new Uint8Array(await photo.arrayBuffer())], contentType: photo.type,
      });
      const headers = new Headers(init.headers);
      headers.set("x-test-photo-id", key);
      return originalFetch(input, {...init, headers});
    };
  });
  function uploadedPhoto(request) {
    const key = request.headers()["x-test-photo-id"];
    const photo = pendingPhotos.get(key);
    pendingPhotos.delete(key);
    assert.ok(photo?.body.length, "Multipart requests must contain the actual selected photo");
    return photo;
  }
  const garment = (id, name, category, image, tags = []) => ({id, name, category, tags, image: `/images/${image}`, color: "Белый", minTemp: -30, maxTemp: 40, rainproof: true, windproof: true});
  const state = {
    uploadAttempts: 0,
    replacementAttempts: 0,
    profile: newProfile ? null : {name: "Тест", gender},
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
    if (pathname === "/api/telegram/session") {
      if (loginState === "fail") { loginState = "ready"; return send({error: "Не удалось подтвердить вход. Повторите попытку."}, 401); }
      return send({authenticated: loginState !== "outside" && !(loginState === "cookies" && method === "GET"), firstName: "Тест", botUrl: "https://t.me/forma_test_bot?startapp"});
    }
    if (pathname === "/api/profile" && method === "POST") {
      state.profile = request.postDataJSON();
      return send({profile: state.profile});
    }
    if (pathname === "/api/settings" && method === "POST") {
      state.city = request.postDataJSON();
      return send({ok: true});
    }
    if (pathname === "/api/cities" && method === "GET") {
      const query = new URL(request.url()).searchParams.get("q");
      if (query === "ошибка") return send({error: "Не удалось найти город. Повторите поиск."}, 503);
      return send({cities: query === "Тест" ? [{name: "Тестовый город", latitude: 50, longitude: 40}] : []});
    }
    if (pathname === "/api/wardrobe" && method === "GET") return send(state);
    if (pathname === "/api/wardrobe" && method === "POST") {
      state.uploadAttempts++;
      const photo = uploadedPhoto(request);
      if (failUpload) {
        failUpload = false;
        return send({error: "Хранилище фотографий временно недоступно. Попробуйте ещё раз позже.", code: "PHOTO_STORAGE_UNAVAILABLE"}, 503);
      }
      const form = await new Request(request.url(), {
        method: "POST", headers: {"content-type": request.headers()["content-type"]}, body: request.postDataBuffer(),
      }).formData();
      const details = JSON.parse(String(form.get("data")));
      const id = `uploaded-${state.uploadAttempts}`;
      const item = {...details, id, image: `/api/images/${id}`, createdAt: "2026-10-05T12:00:00Z"};
      photos.set(id, photo);
      state.items.push(item);
      return send({item}, 201);
    }
    if (pathname.startsWith("/api/images/") && method === "GET") {
      const photo = photos.get(pathname.split("/").pop());
      return photo ? route.fulfill(photo) : send({error: "Фото не найдено."}, 404);
    }
    if (pathname === "/api/wardrobe" && method === "DELETE") {
      const {id} = request.postDataJSON();
      photos.delete(id);
      state.items = state.items.filter(item => item.id !== id);
      return send({ok: true});
    }
    if (pathname === "/api/wardrobe" && method === "PATCH") {
      const multipart = request.headers()["content-type"]?.startsWith("multipart/form-data");
      const form = multipart ? await new Request(request.url(), {
        method: "PATCH", headers: {"content-type": request.headers()["content-type"]}, body: request.postDataBuffer(),
      }).formData() : null;
      const data = form ? JSON.parse(String(form.get("data"))) : request.postDataJSON();
      const item = state.items.find(item => item.id === data.id);
      if (!item) return send({error: "Вещь не найдена."}, 404);
      if (form) {
        state.replacementAttempts++;
        const photo = uploadedPhoto(request);
        if (failReplacement) {
          failReplacement = false;
          return send({error: "Хранилище фотографий временно недоступно. Попробуйте ещё раз позже.", code: "PHOTO_STORAGE_UNAVAILABLE"}, 503);
        }
        photos.set(item.id, photo);
        item.image = `/api/images/${item.id}?v=${state.replacementAttempts}`;
      }
      Object.assign(item, data);
      return send({ok: true, item});
    }
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

export async function mockTelegram(page, theme = "light", {viaSdk = false} = {}) {
  const install = theme => {
    const events = new Map();
    const backHandlers = new Set();
    window.telegramTest = {ready: false, expanded: false, back: false, closing: false, theme: value => {
      window.Telegram.WebApp.colorScheme = value;
      for (const handler of events.get("themeChanged") ?? []) handler();
    }, pressBack: () => { for (const handler of backHandlers) handler(); }};
    window.Telegram = {WebApp: {
      initData: "test-init-data-verified-by-mocked-api", colorScheme: theme,
      isVersionAtLeast: () => true,
      ready: () => { window.telegramTest.ready = true; },
      expand: () => { window.telegramTest.expanded = true; },
      setHeaderColor: () => {}, setBackgroundColor: () => {}, setBottomBarColor: () => {},
      enableClosingConfirmation: () => { window.telegramTest.closing = true; },
      disableClosingConfirmation: () => { window.telegramTest.closing = false; },
      onEvent: (event, handler) => { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(handler); },
      offEvent: (event, handler) => events.get(event)?.delete(handler),
      BackButton: {
        show: () => { window.telegramTest.back = true; }, hide: () => { window.telegramTest.back = false; },
        onClick: handler => backHandlers.add(handler), offClick: handler => backHandlers.delete(handler),
      },
    }};
    const safeArea = () => {
      document.documentElement.style.setProperty("--tg-safe-area-inset-top", "24px");
      document.documentElement.style.setProperty("--tg-content-safe-area-inset-top", "12px");
      document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "20px");
      document.documentElement.style.setProperty("--tg-viewport-height", `${window.innerHeight}px`);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeArea);
    else safeArea();
  };
  if (viaSdk) {
    let failed = false;
    await page.route("https://telegram.org/js/telegram-web-app.js?63", route => {
      if (!failed) { failed = true; return route.abort("failed"); }
      return route.fulfill({contentType: "text/javascript", body: `(${install.toString()})(${JSON.stringify(theme)});`});
    });
  } else await page.addInitScript(install, theme);
}
