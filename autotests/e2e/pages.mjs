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
  photo(name) { return this.item(name).getByRole("img", {name, exact: true}); }
  async layout() {
    return this.page.evaluate(() => {
      const main = document.querySelector("main");
      const bounds = main.getBoundingClientRect();
      const style = getComputedStyle(main);
      return {width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        left: bounds.left + parseFloat(style.paddingLeft),
        right: innerWidth - bounds.right + parseFloat(style.paddingRight)};
    });
  }
  async reload() { await this.page.reload(); }
  async waitForFailedPhoto() { await this.page.getByText("Не удалось загрузить фото", {exact: true}).first().waitFor(); }
}

export class ItemEditorPage {
  constructor(page) {
    this.page = page;
    this.wardrobe = new WardrobePage(page);
    this.dialog = page.getByRole("dialog");
    this.name = this.dialog.getByRole("textbox", {name: "Название", exact: true});
    this.photo = this.dialog.getByLabel("Загрузить фотографию");
    this.error = this.dialog.getByRole("alert");
    this.storageError = this.error.getByText("Хранилище фотографий временно недоступно. Попробуйте ещё раз позже.");
    this.add = this.dialog.getByRole("button", {name: "Добавить в гардероб", exact: true});
    this.original = this.dialog.getByRole("button", {name: "Оригинал", exact: true});
    this.replace = this.dialog.getByRole("button", {name: "Заменить фото", exact: true});
    this.save = this.dialog.getByRole("button", {name: "Сохранить изменения", exact: true});
    this.preview = this.dialog.getByRole("img");
  }
  async create() { await this.page.getByRole("button", {name: "Добавить вещь", exact: true}).click(); }
  async choosePhoto(file) { await this.photo.setInputFiles(file); }
  async replacePhoto(file) {
    const chooser = this.page.waitForEvent("filechooser");
    await this.replace.click();
    await (await chooser).setFiles(file);
  }
  async cancelReplacement() { await this.dialog.getByRole("button", {name: "Отменить замену", exact: true}).click(); }
  async cancel() {
    await this.dialog.getByRole("button", {name: "Отмена", exact: true}).click();
    await this.dialog.waitFor({state: "hidden"});
  }
  async saveChanges() { await this.save.click(); }
  async useOriginal() { await this.original.click(); }
  async rename(name) { await this.name.fill(name); }
  async submit() { await this.add.click(); }
  async previewReady() {
    return this.preview.evaluate(image => image.complete && image.naturalWidth > 0);
  }
  async open(name) { await this.wardrobe.item(name).click(); }
  async saveAs(name) {
    await this.name.fill(name);
    await this.dialog.getByRole("button", {name: "Сохранить изменения"}).click();
    await this.dialog.waitFor({state: "hidden"});
  }
}

export class OutfitsPage {
  constructor(page) {
    this.page = page;
    this.randomLook = page.getByRole("region", {name: "Рандомный лук"});
    this.deletionDialog = page.getByRole("alertdialog");
  }
  async open() {
    await this.page.getByRole("tab", {name: "Образы", exact: true}).click();
    await this.randomLook.waitFor();
  }
  card(name) { return this.page.getByRole("article").filter({has: this.page.getByRole("heading", {name, exact: true})}); }
  photo(outfit, name) { return this.card(outfit).getByRole("img", {name, exact: true}); }
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

export class TelegramPage {
  constructor(page) {
    this.page = page;
    this.entryTitle = page.getByRole("heading", {name: "Ваш гардероб в Telegram", exact: true});
    this.loginError = page.getByRole("heading", {name: "Не удалось войти", exact: true});
    this.launch = page.getByRole("link", {name: "Открыть в Telegram"});
    this.profile = page.getByRole("dialog");
    this.name = this.profile.getByRole("textbox", {name: "Имя", exact: true});
  }
  async visit(baseURL) { await this.page.goto(baseURL); }
  async retry() { await this.page.getByRole("button", {name: "Повторить", exact: true}).click(); }
  async back() {
    await this.page.waitForFunction(() => window.telegramTest.back);
    await this.page.evaluate(() => window.telegramTest.pressBack());
  }
  async changeTheme(value) { await this.page.evaluate(theme => window.telegramTest.theme(theme), value); }
  async openProfile() { await this.page.getByRole("button", {name: "Открыть профиль", exact: true}).click(); }
  async startWardrobe() { await this.profile.getByRole("button", {name: "Создать мой гардероб"}).click(); }
  async runtime() { return this.page.evaluate(() => ({...window.telegramTest, theme: undefined, pressBack: undefined})); }
  async layout() {
    return this.page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      theme: document.documentElement.dataset.theme, background: getComputedStyle(document.body).backgroundColor,
      headerPadding: getComputedStyle(document.querySelector(".app-header")).paddingTop,
      navigationTop: document.querySelector(".app-navigation").getBoundingClientRect().top,
    }));
  }
}

export class DialogPage {
  constructor(page) {
    this.page = page;
    this.dialog = page.getByRole("dialog");
    this.scroll = this.dialog.getByTestId("dialog-scroll");
    this.closeButton = this.dialog.getByRole("button", {name: /^Закрыть/});
  }
  async settled() {
    await this.dialog.waitFor();
    await this.dialog.evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
  }
  async close() {
    await this.closeButton.click();
    await this.dialog.waitFor({state: "hidden"});
  }
  async scrollToBottom() { await this.scroll.evaluate(element => { element.scrollTop = element.scrollHeight; }); }
  async layout() {
    await this.settled();
    return this.dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const close = element.querySelector("[data-slot=dialog-close]");
      const scroll = element.querySelector("[data-testid=dialog-scroll]");
      const button = close?.getBoundingClientRect();
      const closeHit = button ? document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2) : null;
      const footer = element.querySelector(".dialog-footer")?.getBoundingClientRect();
      return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        closeX: button?.x, closeY: button?.y, closeWidth: button?.width, closeHeight: button?.height,
        closeInsideScroll: scroll?.contains(close), scrollTop: scroll?.scrollTop,
        closeReachable: close === closeHit || close?.contains(closeHit),
        footerY: footer?.y, footerBottom: footer ? footer.y + footer.height : undefined,
        scrollWidth: scroll?.scrollWidth, clientWidth: scroll?.clientWidth,
        inputFocused: document.activeElement?.tagName === "INPUT",
        focusInside: element.contains(document.activeElement),
        animationDuration: getComputedStyle(element).animationDuration};
    });
  }
  async escape() { await this.page.keyboard.press("Escape"); }
  async tab() { await this.page.keyboard.press("Tab"); }
  async keyboardViewport(height, top = 0) {
    await this.page.evaluate(({height, top}) => {
      Object.defineProperty(window.visualViewport, "height", {configurable: true, value: height});
      Object.defineProperty(window.visualViewport, "offsetTop", {configurable: true, value: top});
      window.visualViewport.dispatchEvent(new Event("resize"));
    }, {height, top});
    await this.dialog.evaluate(async element => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return element.getBoundingClientRect().height;
    });
  }
}

export class ProfilePage extends DialogPage {
  constructor(page) {
    super(page);
    this.trigger = page.getByRole("button", {name: "Открыть профиль", exact: true});
    this.name = this.dialog.getByRole("textbox", {name: "Имя", exact: true});
    this.save = this.dialog.getByRole("button", {name: "Сохранить", exact: true});
    this.saving = this.dialog.getByRole("button", {name: "Сохраняем…", exact: true});
    this.error = this.dialog.getByRole("alert");
  }
  async open() { await this.trigger.click(); await this.settled(); }
  async focusName() { await this.name.click(); }
  async nameStyle() {
    return this.name.evaluate(element => {
      const style = getComputedStyle(element);
      return {fontSize: parseFloat(style.fontSize), outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow, focused: document.activeElement === element};
    });
  }
  async triggerFocused() { return this.trigger.evaluate(element => document.activeElement === element); }
}

export class CityPage extends DialogPage {
  constructor(page) {
    super(page);
    this.trigger = page.getByRole("button", {name: /^Выбрать город/});
    this.search = this.dialog.getByRole("combobox", {name: "Найти город"});
    this.options = this.dialog.getByRole("option");
    this.status = this.dialog.getByRole("status");
    this.empty = this.status.getByText("Город не найден. Попробуйте другое название.");
    this.error = this.dialog.getByRole("alert");
  }
  async open() { await this.trigger.click(); await this.settled(); }
  async searchFor(query) { await this.search.fill(query); }
  async select(name) { await this.dialog.getByRole("option", {name, exact: true}).click(); }
  async resultGap() {
    const input = await this.search.boundingBox();
    const first = await this.options.first().boundingBox();
    return first.y - input.y - input.height;
  }
}
