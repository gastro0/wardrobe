// Page Objects contain UI actions and locators; assertions stay in the tests.
export class WardrobePage {
  constructor(page) { this.page = page; }
  async open(baseURL) {
    await this.page.goto(baseURL);
    await this.page.getByRole("heading", {name: "мой гардероб", exact: true}).waitFor();
    await this.page.getByText("Привет, Тест!").waitFor();
  }
  async selectCategory(name) {
    await this.page.getByRole("combobox", {name: "Категория вещей"}).click();
    await this.page.getByRole("option", {name, exact: true}).click();
  }
  item(name) { return this.page.getByRole("button", {name: `Открыть ${name}`, exact: true}); }
}

export class OutfitsPage {
  constructor(page) {
    this.page = page;
    this.randomLook = page.getByRole("region", {name: "Рандомный лук"});
  }
  async open() {
    await this.page.getByRole("tab", {name: "Образы", exact: true}).click();
    await this.randomLook.waitFor();
  }
  card(name) { return this.page.getByRole("article").filter({has: this.page.getByRole("heading", {name, exact: true})}); }
  async randomPieces() { return this.randomLook.getByRole("img").evaluateAll(images => images.map(image => image.alt).sort()); }
  async refreshRandomLook() {
    await this.randomLook.getByRole("button", {name: "Обновить рандомный лук"}).click();
    await this.randomLook.getByRole("status").getByText("Новое сочетание готово.").waitFor();
  }
  async openRandomLookInEditor() { await this.randomLook.getByRole("button", {name: "Открыть в конструкторе"}).click(); }
  async edit(name) { await this.card(name).getByRole("button", {name: `Изменить образ ${name}`}).click(); }
  async requestDelete(name) { await this.card(name).getByRole("button", {name: `Удалить образ ${name}`}).click(); }
  async confirmDelete() { await this.page.getByRole("alertdialog").getByRole("button", {name: "Удалить", exact: true}).click(); }
  async cancelDelete() {
    const dialog = this.page.getByRole("alertdialog");
    await dialog.getByRole("button", {name: "Отмена"}).click();
    await dialog.waitFor({state: "hidden"});
  }
}

export class OutfitEditor {
  constructor(page) {
    this.dialog = page.getByRole("dialog");
    this.name = this.dialog.getByRole("textbox", {name: "Название образа"});
  }
  async saveAs(name) {
    await this.name.fill(name);
    await this.dialog.getByRole("button", {name: "Сохранить образ", exact: true}).click();
  }
  async remove(name) { await this.dialog.getByRole("button", {name: `Убрать ${name}`, exact: true}).click(); }
}

export class WeatherPage {
  constructor(page) { this.page = page; }
  async open() { await this.page.getByRole("tab", {name: "Погода", exact: true}).click(); }
  async retry() { await this.page.getByRole("button", {name: "Повторить", exact: true}).click(); }
  async tomorrow() { await this.page.getByRole("button", {name: /^Завтра/}).click(); }
}
