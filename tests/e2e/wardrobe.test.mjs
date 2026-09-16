import assert from "node:assert/strict";
import {after, before, test} from "node:test";
import {launchBrowser, mockWardrobe} from "./fixture.mjs";
import {WardrobePage, OutfitsPage, OutfitEditor, WeatherPage} from "./pages.mjs";

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
