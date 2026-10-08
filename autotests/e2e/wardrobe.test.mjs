import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {after, before, test} from "node:test";
import {projectPath} from "../project.mjs";
import {launchBrowser, mockWardrobe, mockTelegram} from "./fixture.mjs";
import {WardrobePage, ItemEditorPage, OutfitsPage, OutfitEditor, WeatherPage, TelegramPage, DialogPage, ProfilePage, CityPage} from "./pages.mjs";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787";
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function session(t, viewport, options) {
  const context = await browser.newContext({viewport});
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "No browser runtime errors"));
  const state = await mockWardrobe(page, options);
  if (options?.telegram) await mockTelegram(page, options.theme);
  const wardrobe = new WardrobePage(page);
  await wardrobe.open(baseURL);
  return {page, state, wardrobe, outfits: new OutfitsPage(page), editor: new OutfitEditor(page), weather: new WeatherPage(page)};
}

for (const viewport of [{width: 1280, height: 900}, {width: 390, height: 844}]) {
  test(`Outfit lifecycle and collage at ${viewport.width}px`, async t => {
    const {page, state, wardrobe, outfits, editor} = await session(t, viewport);
    await wardrobe.selectCategory("Джинсы");
    await wardrobe.item("Прямые джинсы").waitFor();
    assert.equal(await wardrobe.item("Молочная футболка").count(), 0);
    await outfits.open();
    const card = outfits.card("На каждый день");
    assert.equal(await card.getByRole("img").count(), 6, "All pieces appear, including accessories");
    const head = await card.getByRole("img", {name: "Любимая шапка"}).boundingBox();
    const upper = await card.getByRole("img", {name: "Молочная футболка"}).boundingBox();
    const lower = await card.getByRole("img", {name: "Прямые джинсы"}).boundingBox();
    const feet = await card.getByRole("img", {name: "Белые кеды"}).boundingBox();
    assert.ok(head.y < upper.y && upper.y < lower.y && lower.y < feet.y, "Clothing follows body order");
    const savedBounds = await card.boundingBox();
    const randomBounds = await outfits.randomLook.boundingBox();
    assert.ok(randomBounds.y >= savedBounds.y + savedBounds.height, "Random look stays below saved outfits");
    const first = await outfits.randomPieces();
    await outfits.refreshRandomLook();
    assert.notDeepEqual(await outfits.randomPieces(), first);
    await outfits.openRandomLookInEditor();
    await editor.saveAs("Новый микс");
    await outfits.card("Новый микс").waitFor();
    assert.equal(state.outfits.length, 2);
    await page.reload();
    await outfits.open();
    await outfits.card("Новый микс").waitFor();
    await outfits.edit("На каждый день");
    await editor.remove("Чёрная сумка");
    await editor.saveAs("Без сумки");
    await outfits.card("Без сумки").waitFor();
    assert.equal(await outfits.card("Без сумки").getByRole("img", {name: "Чёрная сумка"}).count(), 0);
    await outfits.requestDelete("Без сумки");
    await outfits.cancelDelete();
    assert.equal(await outfits.card("Без сумки").count(), 1);
    await outfits.requestDelete("Без сумки");
    await outfits.confirmDelete();
    await outfits.card("Без сумки").waitFor({state: "detached"});
  });
}

for (const width of [390, 1280]) {
  test(`Clothing checkboxes show checkmarks in both themes at ${width}px`, async t => {
    const {page, state, wardrobe} = await session(t, {width, height: 844}, {telegram: true});
    const editor = new ItemEditorPage(page);
    const telegram = new TelegramPage(page);
    const labels = ["Защита от дождя", "Защита от ветра", "Определять по тегам и категории"];

    for (const theme of ["light", "dark"]) {
      await telegram.changeTheme(theme);
      await editor.create();
      for (const name of labels) {
        const checkbox = editor.checkbox(name);
        await checkbox.setChecked(false);
        assert.equal(await checkbox.isChecked(), false);
        const unchecked = await editor.checkboxAppearance(name);
        assert.equal(unchecked.checkmarkVisible, false, `${name}: unchecked box has no checkmark`);

        await checkbox.click();
        assert.equal(await checkbox.isChecked(), true);
        const checked = await editor.checkboxAppearance(name);
        assert.equal(checked.checkmarkVisible, true, `${name}: selected box shows a checkmark`);
        assert.equal(checked.background, checked.dialogBackground, `${name}: selection does not fill the box`);
        assert.notEqual(checked.checkmarkColor, checked.background, `${name}: checkmark contrasts with its background`);

        await editor.toggleCheckboxWithKeyboard(name);
        assert.equal(await checkbox.isChecked(), false, `${name}: Space unchecks the box`);
        const focused = await editor.checkboxAppearance(name);
        assert.equal(focused.checkmarkVisible, false);
        assert.equal(focused.focused && focused.focusVisible, true);
      }
      await editor.cancel();
    }

    await editor.open("Молочная футболка");
    assert.equal(await editor.checkbox("Защита от дождя").isChecked(), true);
    await editor.toggleCheckboxWithKeyboard("Защита от дождя");
    await editor.saveChanges();
    await editor.dialog.waitFor({state: "hidden"});
    assert.equal(state.items[0].rainproof, false);
    assert.equal(state.items[0].windproof, true);
    await wardrobe.reload();
    await editor.open("Молочная футболка");
    assert.equal(await editor.checkbox("Защита от дождя").isChecked(), false);
    assert.equal((await editor.checkboxAppearance("Защита от ветра")).checkmarkVisible, true);
  });
}

test("Wardrobe reload waits for saved data while an unrelated image is still loading", async t => {
  const {page, wardrobe} = await session(t, {width: 390, height: 844});
  const image = await readFile(projectPath("public/images/blue-shirt.jpg"));
  let releaseImage;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  let finishImage;
  const imageFinished = new Promise(resolve => { finishImage = resolve; });
  let requested = false;
  await page.route("**/images/e2e-slow.jpg", async route => {
    requested = true;
    try {
      await imageGate;
      await route.fulfill({body: image, contentType: "image/jpeg"});
    } finally {
      finishImage();
    }
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const image = document.createElement("img");
      image.src = "/images/e2e-slow.jpg";
      image.alt = "";
      image.hidden = true;
      document.body.append(image);
    }, {once: true});
  });
  try {
    await wardrobe.reload();
    await wardrobe.item("Молочная футболка").waitFor();
    assert.equal(requested, true);
    assert.equal(await page.evaluate(() => document.readyState), "interactive",
      "The wardrobe is usable before the unrelated image releases the load event");
  } finally {
    releaseImage();
    if (requested) await imageFinished;
  }
});

test("Clothing edits update the collection and persist after reload", async t => {
  const {page, state, wardrobe} = await session(t, {width: 390, height: 844});
  const editor = new ItemEditorPage(page);
  await editor.open("Молочная футболка");
  assert.equal(await editor.name.inputValue(), "Молочная футболка");
  await editor.saveAs("Любимая футболка");
  await wardrobe.item("Любимая футболка").waitFor();
  assert.equal(state.items.find(item => item.id === "tee").name, "Любимая футболка");
  await page.reload();
  await wardrobe.item("Любимая футболка").waitFor();
});

for (const width of [390, 1280]) {
  test(`Photo replacement supports cancel, retry and updates saved outfits at ${width}px`, async t => {
    const {page, state, wardrobe, outfits} = await session(t, {width, height: 844}, {failReplacement: true});
    await page.route("**/background-removal/**", route => route.abort());
    const item = new ItemEditorPage(page);
    const initial = structuredClone(state.items[0]);
    const photo = projectPath("public/images/blue-shirt.jpg");
    await item.open(initial.name);
    await item.replacePhoto(photo);
    await item.useOriginal();
    assert.equal(await item.previewReady(), true);
    await item.cancelReplacement();
    assert.equal(await item.preview.getAttribute("src"), initial.image);
    assert.equal(await item.name.inputValue(), initial.name);
    await item.replacePhoto(photo);
    await item.useOriginal();
    await item.cancel();
    assert.deepEqual(state.items[0], initial, "Closing without saving preserves the stored item");
    assert.equal(state.replacementAttempts, 0);

    await item.open(initial.name);
    await item.replacePhoto(photo);
    await item.useOriginal();
    await item.rename("Футболка с новым фото");
    await item.saveChanges();
    await item.storageError.waitFor();
    assert.deepEqual(state.items[0], initial, "An upload failure preserves both old photo and metadata");
    assert.equal(await item.name.inputValue(), "Футболка с новым фото");
    assert.equal(await item.previewReady(), true);
    await item.saveChanges();
    await item.dialog.waitFor({state: "hidden"});
    assert.equal(state.replacementAttempts, 2);
    assert.equal(state.items.length, 7, "Replacement does not create an extra item");
    const saved = state.items[0];
    assert.equal(saved.id, initial.id);
    assert.notEqual(saved.image, initial.image);
    assert.equal(await wardrobe.photo(saved.name).getAttribute("src"), saved.image);
    await wardrobe.photo(saved.name).evaluate(image => image.decode());
    await outfits.open();
    assert.equal(await outfits.photo("На каждый день", saved.name).getAttribute("src"), saved.image);
    await wardrobe.reload();
    await item.open(saved.name);
    assert.equal(await item.preview.getAttribute("src"), saved.image);
    assert.equal(await item.previewReady(), true);
  });

  test(`Photo upload keeps the original after a storage failure and retries at ${width}px`, async t => {
    const {page, state, wardrobe} = await session(t, {width, height: 844}, {failUpload: true});
    // Exercise the supported original-photo fallback without downloading the ML model.
    await page.route("**/background-removal/**", route => route.abort());
    const item = new ItemEditorPage(page);
    await item.create();
    await item.choosePhoto(projectPath("public/images/cream-tshirt.jpg"));
    await item.useOriginal();
    await item.rename("Зимние ботинки — проверка сохранения");
    await item.submit();
    await item.storageError.waitFor();
    assert.equal(state.uploadAttempts, 1);
    assert.equal(state.items.length, 7, "An unsuccessful upload creates no item");
    assert.equal(await item.name.inputValue(), "Зимние ботинки — проверка сохранения");
    assert.equal(await item.previewReady(), true, "The original remains available for retry");
    await item.submit();
    await item.dialog.waitFor({state: "hidden"});
    await wardrobe.item("Зимние ботинки — проверка сохранения").waitFor();
    await wardrobe.photo("Зимние ботинки — проверка сохранения").evaluate(image => image.decode());
    assert.equal(state.uploadAttempts, 2);
    assert.equal(state.items.length, 8, "Retry creates exactly one item");
    await wardrobe.reload();
    await wardrobe.item("Зимние ботинки — проверка сохранения").waitFor();
  });
}

test("Replacing an unavailable photo recovers the wardrobe card", async t => {
  const {page, state, wardrobe} = await session(t, {width: 390, height: 844});
  await page.route("**/images/cream-tshirt.jpg", route => route.abort());
  await page.route("**/background-removal/**", route => route.abort());
  await wardrobe.reload();
  await wardrobe.waitForFailedPhoto();
  const item = new ItemEditorPage(page);
  await item.open("Молочная футболка");
  await item.replacePhoto({name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo")});
  await item.error.waitFor();
  assert.equal(state.replacementAttempts, 0);
  assert.equal(await item.preview.getAttribute("src"), state.items[0].image);
  await item.replacePhoto(projectPath("public/images/blue-shirt.jpg"));
  await item.useOriginal();
  await item.saveChanges();
  await item.dialog.waitFor({state: "hidden"});
  const photo = wardrobe.photo("Молочная футболка");
  await photo.waitFor();
  await photo.evaluate(image => image.decode());
  assert.equal(await photo.getAttribute("src"), state.items[0].image);
});

test("Weather and saving recover after errors", async t => {
  const {page, outfits, editor, weather} = await session(t, {width: 1280, height: 900}, {failWeather: true, failSave: true});
  await weather.open();
  await page.getByRole("alert").getByText("Тестовая ошибка погоды").waitFor();
  await weather.retry();
  await page.getByRole("heading", {name: "Образ на сегодня", exact: true}).waitFor();
  await weather.tomorrow();
  await page.getByRole("heading", {name: "Образ на день", exact: true}).waitFor();
  await outfits.open();
  await outfits.openRandomLookInEditor();
  await editor.saveAs("После ошибки");
  await editor.dialog.getByRole("alert").getByText("Тестовая ошибка сохранения").waitFor();
  assert.equal(await editor.name.inputValue(), "После ошибки");
  await editor.saveAs("После ошибки");
  await outfits.card("После ошибки").waitFor();
});

for (const width of [390, 1280]) {
  test(`Telegram navigation, safe areas and theme at ${width}px`, async t => {
    const {page, outfits, wardrobe} = await session(t, {width, height: 844}, {telegram: true, theme: "dark"});
    const telegram = new TelegramPage(page);
    assert.equal((await telegram.runtime()).ready, true);
    assert.equal((await telegram.runtime()).expanded, true);
    assert.equal((await telegram.runtime()).back, false);
    const dark = await telegram.layout();
    assert.equal(dark.theme, "dark");
    assert.equal(dark.background, "rgb(24, 24, 24)");
    assert.equal(dark.headerPadding, "36px");
    assert.ok(dark.navigationTop >= 36, "Navigation stays below Telegram's top safe area");
    assert.ok(dark.scrollWidth <= dark.width);
    await outfits.open();
    await telegram.back();
    await wardrobe.item("Молочная футболка").waitFor();
    await telegram.openProfile();
    await telegram.profile.waitFor();
    assert.equal((await telegram.runtime()).closing, true);
    await telegram.back();
    await telegram.profile.waitFor({state: "hidden"});
    assert.equal((await telegram.runtime()).closing, false);
    await telegram.changeTheme("light");
    const light = await telegram.layout();
    assert.equal(light.background, "rgb(255, 255, 255)");
    assert.equal(light.theme, "light");
  });
}

for (const loginState of ["outside", "fail", "cookies"]) {
  test(`Telegram entry handles ${loginState} without loading private data`, async t => {
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    t.after(() => context.close());
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await mockWardrobe(page, {loginState});
    if (loginState !== "outside") await mockTelegram(page);
    const protectedRequests = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/") && !request.url().includes("/api/telegram/session")) protectedRequests.push(request.url());
    });
    const telegram = new TelegramPage(page);
    await telegram.visit(baseURL);
    if (loginState === "outside") {
      await telegram.entryTitle.waitFor();
      assert.equal(await telegram.launch.getAttribute("href"), "https://t.me/forma_test_bot?startapp");
      assert.deepEqual(protectedRequests, []);
    } else {
      await telegram.loginError.waitFor();
      assert.deepEqual(protectedRequests, []);
      if (loginState === "fail") {
        await telegram.retry();
        await new WardrobePage(page).item("Молочная футболка").waitFor();
      }
    }
  });
}

test("Telegram SDK network failure can be retried", async t => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await mockWardrobe(page);
  await mockTelegram(page, "light", {viaSdk: true});
  const telegram = new TelegramPage(page);
  await telegram.visit(baseURL + "/#tgWebAppData=test");
  await telegram.loginError.waitFor();
  await telegram.retry();
  await new WardrobePage(page).item("Молочная футболка").waitFor();
  assert.equal((await telegram.runtime()).ready, true);
});

test("First Telegram login prefills the verified name and keeps onboarding open on Back", async t => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await mockWardrobe(page, {newProfile: true});
  await mockTelegram(page);
  const telegram = new TelegramPage(page);
  await telegram.visit(baseURL);
  await telegram.profile.waitFor();
  assert.equal(await telegram.name.inputValue(), "Тест");
  await telegram.back();
  assert.equal(await telegram.profile.isVisible(), true);
  await telegram.startWardrobe();
  await telegram.profile.waitFor({state: "hidden"});
});

test("Profile filtering and deleted pieces remain consistent", async t => {
  const {page, state, outfits} = await session(t, {width: 390, height: 844}, {gender: "male"});
  state.items.push({...state.items[0], id: "dress", name: "Платье", category: "dress"});
  state.outfits.push({id: "hidden", name: "С платьем", itemIds: ["dress", "shoes"], createdAt: ""});
  state.outfits[0].itemIds.push("deleted-item");
  await page.reload();
  await outfits.open();
  assert.equal(await outfits.card("С платьем").count(), 0);
  await outfits.card("На каждый день").getByText(/Есть удалённые вещи/).waitFor();
  assert.equal(await outfits.card("На каждый день").getByRole("img").count(), 6);
  assert.ok(!(await outfits.randomPieces()).includes("Платье"));
});

for (const width of [320, 390, 768, 1280]) {
  test(`Dialogs keep close controls and content inside the viewport at ${width}px`, async t => {
    const {page, wardrobe, outfits, editor} = await session(t, {width, height: 844}, {telegram: true, theme: "dark"});
    const telegram = new TelegramPage(page);
    const profile = new ProfilePage(page);
    const city = new CityPage(page);
    const dialog = new DialogPage(page);
    for (const open of [() => profile.open(), () => city.open(),
      () => new ItemEditorPage(page).open("Молочная футболка"),
      async () => { await outfits.open(); await outfits.edit("На каждый день"); }]) {
      await open();
      const before = await dialog.layout();
      assert.ok(before.focusInside && !before.inputFocused, "Opening does not raise the keyboard");
      assert.equal(before.closeInsideScroll, false, "Close is outside the scrolling body");
      assert.ok(before.x >= 0 && before.x + before.width <= width + 1);
      assert.ok(before.y >= 36 && before.y + before.height <= 824);
      assert.ok(before.scrollWidth <= before.clientWidth + 1, "Dialog content fits its container");
      assert.ok(before.closeWidth >= 44 && before.closeHeight >= 44);
      await dialog.scrollToBottom();
      const after = await dialog.layout();
      assert.equal(after.closeY, before.closeY, "Close stays in place during scrolling");
      assert.equal(after.closeReachable, true, "Scrolling content does not cover Close");
      assert.equal(after.footerY, before.footerY, "Save controls stay in place during scrolling");
      if (after.footerBottom) assert.ok(after.footerBottom <= before.y + before.height);
      await telegram.back();
      await dialog.dialog.waitFor({state: "hidden"});
    }
    await telegram.back();
    await wardrobe.item("Молочная футболка").waitFor();
    for (const open of [async () => {}, () => outfits.open(), () => new WeatherPage(page).open()]) {
      await open();
      const layout = await wardrobe.layout();
      assert.ok(layout.scrollWidth <= layout.width, "The page cannot scroll sideways");
      assert.ok(Math.abs(layout.left - layout.right) <= 1, "Content has symmetric gutters");
    }
    // The focused text field is a common failure case for Telegram's native Back.
    await outfits.open();
    await outfits.edit("На каждый день");
    await editor.name.fill("Несохранённое название");
    await telegram.back();
    await dialog.dialog.waitFor({state: "hidden"});
    await outfits.card("На каждый день").waitFor();
    await outfits.requestDelete("На каждый день");
    await telegram.back();
    await outfits.deletionDialog.waitFor({state: "hidden"});
    await outfits.card("На каждый день").waitFor();
  });
}

test("Profile focus and keyboard resizing keep the heading stable and restore focus on close", async t => {
  const {page} = await session(t, {width: 390, height: 844}, {telegram: true});
  const profile = new ProfilePage(page);
  await profile.open();
  const initial = await profile.layout();
  await profile.focusName();
  const field = await profile.nameStyle();
  assert.ok(field.focused && field.fontSize >= 16, "The input avoids iOS text zoom");
  assert.equal(field.outlineWidth, "0px", "Focus does not add an outer frame");
  assert.notEqual(field.boxShadow, "none", "Focus remains visible inside the field");
  await profile.keyboardViewport(420);
  const keyboard = await profile.layout();
  assert.equal(keyboard.y, initial.y, "Keyboard does not recenter the dialog");
  assert.ok(keyboard.y + keyboard.height <= 400, "Content fits above the keyboard");
  assert.equal(keyboard.closeReachable, true);
  await profile.scrollToBottom();
  assert.equal((await profile.layout()).closeY, initial.closeY);
  await profile.keyboardViewport(420, 30);
  assert.equal((await profile.layout()).y, initial.y + 30, "Controls follow the visible viewport on iOS");
  await profile.keyboardViewport(844);
  await profile.close();
  assert.equal(await profile.triggerFocused(), true);
});

test("City results have compact spacing and recover from empty and failed searches", async t => {
  const {page, state} = await session(t, {width: 390, height: 844});
  const city = new CityPage(page);
  await city.open();
  assert.equal(await city.options.count(), 5);
  assert.ok(await city.resultGap() <= 16, "No empty status padding above popular cities");
  await city.searchFor("нет города");
  await city.empty.waitFor();
  await city.searchFor("ошибка");
  await city.error.waitFor();
  await city.searchFor("Тест");
  await city.select("Тестовый город");
  await city.dialog.waitFor({state: "hidden"});
  assert.equal(state.city.name, "Тестовый город");
});

test("Back and Escape cannot dismiss a profile while saving, and failed saves can be retried", async t => {
  const {page} = await session(t, {width: 390, height: 844}, {telegram: true});
  const profile = new ProfilePage(page);
  const telegram = new TelegramPage(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route("**/api/profile", async route => {
    await pending;
    await route.fulfill({status: 503, json: {error: "Не удалось сохранить профиль. Повторите попытку."}});
  }, {times: 1});
  await profile.open();
  await profile.name.fill("Новое имя");
  await profile.save.click();
  await profile.saving.waitFor();
  try {
    await telegram.back();
    await profile.escape();
    assert.equal(await profile.saving.isVisible(), true);
  } finally { release(); }
  await profile.error.waitFor();
  assert.equal(await profile.name.inputValue(), "Новое имя");
  await profile.save.click();
  await profile.dialog.waitFor({state: "hidden"});
  assert.equal(await profile.triggerFocused(), true);
});

test("Reduced motion still closes dialogs and restores keyboard focus", async t => {
  const {page} = await session(t, {width: 390, height: 844});
  await page.emulateMedia({reducedMotion: "reduce"});
  const profile = new ProfilePage(page);
  await profile.open();
  assert.ok(parseFloat((await profile.layout()).animationDuration) < 0.001);
  await profile.tab();
  assert.equal((await profile.layout()).focusInside, true);
  await profile.escape();
  await profile.dialog.waitFor({state: "hidden"});
  assert.equal(await profile.triggerFocused(), true);
});

for (const width of [320, 1280]) {
  test(`Long names and unavailable photos do not widen content at ${width}px`, async t => {
    const {page, state, wardrobe, outfits} = await session(t, {width, height: 844});
    state.profile.name = "ОченьДлинноеИмя".repeat(4);
    state.items[0].name = "ДлинноеНазваниеВещи".repeat(5);
    state.items[0].tags = ["ДлинныйТегБезПробелов".repeat(2)];
    state.outfits[0].name = "ДлинноеНазваниеОбраза".repeat(5);
    await page.route("**/images/**", route => route.abort());
    await wardrobe.reload();
    await wardrobe.item(state.items[0].name).waitFor();
    await wardrobe.waitForFailedPhoto();
    const layout = await wardrobe.layout();
    assert.ok(layout.scrollWidth <= width);
    const item = new ItemEditorPage(page);
    await item.open(state.items[0].name);
    const dialog = new DialogPage(page);
    const itemLayout = await dialog.layout();
    assert.ok(itemLayout.scrollWidth <= itemLayout.clientWidth + 1);
    await dialog.close();
    await outfits.open();
    await outfits.card(state.outfits[0].name).waitFor();
    assert.ok((await wardrobe.layout()).scrollWidth <= width);
    await outfits.edit(state.outfits[0].name);
    const outfitLayout = await dialog.layout();
    assert.ok(outfitLayout.scrollWidth <= outfitLayout.clientWidth + 1);
  });
}
