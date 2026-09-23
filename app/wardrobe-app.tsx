"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudSun, ChevronDown, Info, Layers, MapPin, Plus, Shirt as Hanger, UserRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster, toast } from "sonner";
import { defaultCity, type City, type Item, type Outfit, type Profile } from "@/lib/wardrobe";
import { demoItems, demoOutfits } from "@/lib/demo";
import { api } from "@/lib/client";
import { useTelegramNavigation } from "@/hooks/use-telegram-navigation";
import { useWeather } from "@/hooks/use-weather";
import { useWardrobeView } from "@/hooks/use-wardrobe-view";
import CityPicker from "./city-picker";
import ItemEditor from "./item-editor";
import OutfitEditor from "./outfit-editor";
import OutfitsSection from "./outfits-section";
import ProfileEditor from "./profile-editor";
import WardrobeSection from "./wardrobe-section";
import WeatherSection from "./weather-section";

type WardrobeResponse = {
  items: Item[]; outfits: Outfit[]; city: City | null; profile: Profile | null;
};
type Deleting = { type: "item" | "outfit"; id: string; name: string };

export default function WardrobeApp({ initialName }: { initialName?: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const gender = profile?.gender ?? "unspecified";
  const [tab, setTab] = useState("wardrobe");
  const [items, setItems] = useState<Item[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [samples, setSamples] = useState<Outfit[]>(demoOutfits);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [city, setCity] = useState<City>(defaultCity);
  const [cityOpen, setCityOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [editor, setEditor] = useState<{ item: Item | null } | null>(null);
  const [builder, setBuilder] = useState<Partial<Outfit> | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [variation, setVariation] = useState(0);
  const loadController = useRef<AbortController | null>(null);

  const dialogOpen = !!(editor || builder || deleting || cityOpen || profileOpen);
  const telegramBack = useCallback(() => {
    if (dialogOpen) {
      // Use the dialog's Escape handling to preserve focus and busy guards.
      (document.activeElement ?? document).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    } else setTab("wardrobe");
  }, [dialogOpen]);
  useTelegramNavigation(dialogOpen || tab !== "wardrobe" ? telegramBack : null,
    !!(editor || builder || profileOpen));

  const { weather, weatherBusy, weatherError, day, setDay, refreshWeather } = useWeather(city);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const data = await api<WardrobeResponse>("/api/wardrobe", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setProfile(data.profile);
      setProfileOpen(!data.profile);
      setItems(data.items);
      setOutfits(data.outfits);
      setDemo(data.items.length === 0);
      if (data.city) setCity(data.city);
      setLoaded(true);
    } catch (error) {
      if (!controller.signal.aborted) setLoadError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; loadController.current?.abort(); };
  }, [load]);
  function retryLoad() {
    setLoading(true);
    setLoadError("");
    void load();
  }
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [tab]);

  const {
    visibleItems, visibleOutfits, outfitItems, selectedWeather, recommendation, suitableOutfits,
  } = useWardrobeView(demo ? demoItems : items, demo ? samples : outfits,
    gender, weather, day, variation);

  function addOwn() { setBuilder(null); setEditor({ item: null }); }
  function savedProfile(next: Profile) {
    setProfile(next);
    setCategory("all");
    setVariation(0);
    setEditor(null);
    setBuilder(null);
  }
  function savedItem(item: Item) {
    setItems(old => old.some(existing => existing.id === item.id)
      ? old.map(existing => existing.id === item.id ? item : existing) : [item, ...old]);
    setDemo(false);
    setCategory("all");
  }
  function savedOutfit(outfit: Outfit) {
    const setter = demo ? setSamples : setOutfits;
    setter(old => old.some(existing => existing.id === outfit.id)
      ? old.map(existing => existing.id === outfit.id ? outfit : existing) : [outfit, ...old]);
    setTab("outfits");
  }
  async function changeCity(next: City) {
    await api("/api/settings", { method: "POST", body: JSON.stringify(next) });
    setCity(next);
    setVariation(0);
    toast.success(`Погода: ${next.name}`);
  }
  function confirmDelete(type: Deleting["type"], value: Item | Outfit) {
    setDeleteError("");
    setDeleting({ type, id: value.id, name: value.name });
  }
  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api(deleting.type === "item" ? "/api/wardrobe" : "/api/outfits", {
        method: "DELETE", body: JSON.stringify({ id: deleting.id }),
      });
      if (deleting.type === "item") setItems(old => old.filter(item => item.id !== deleting.id));
      else setOutfits(old => old.filter(outfit => outfit.id !== deleting.id));
      toast.success(deleting.type === "item" ? "Вещь удалена" : "Образ удалён");
      setDeleting(null);
    } catch (error) { setDeleteError((error as Error).message); }
    finally { setDeleteBusy(false); }
  }

  return <Tabs value={tab} onValueChange={setTab} className="app-tabs">
    <Toaster position="top-center" toastOptions={{ style: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14 } }}/>
    <header className="app-header">
      <button className="brand" aria-label="Форма — открыть гардероб" onClick={() => setTab("wardrobe")}>форма</button>
      <button className="header-city" aria-label={`Выбрать город. Сейчас: ${city.name}`}
        onClick={() => setCityOpen(true)}>
        <MapPin size={20}/><span>{city.name}</span><ChevronDown size={14}/>
      </button>
      <button className="header-profile" aria-label="Открыть профиль"
        onClick={() => setProfileOpen(true)} disabled={!loaded}>
        <UserRound size={20}/><span>{profile?.name ?? "Профиль"}</span>
      </button>
    </header>
    <nav className="app-navigation" aria-label="Основная навигация">
      <TabsList className="nav-tabs" aria-label="Разделы приложения">
        <TabsTrigger value="wardrobe"><Hanger/><span>Гардероб</span></TabsTrigger>
        <TabsTrigger value="outfits"><Layers/><span>Образы</span></TabsTrigger>
        <TabsTrigger value="weather"><CloudSun/><span>Погода</span></TabsTrigger>
      </TabsList>
    </nav>
    <main className="main">
      {tab === "wardrobe" && profile && <p className="profile-greeting">Привет, {profile.name}!</p>}
      <div className="title-row">
        <div>
          <h1 className="page-title">{tab === "wardrobe" ? "мой гардероб" : tab === "outfits" ? "мои образы" : "по погоде"}</h1>
          <p className="page-subtitle">{tab === "wardrobe"
            ? demo ? "Здесь начнётся ваша коллекция" : `${visibleItems.length} вещей в коллекции`
            : tab === "outfits" ? "Сочетания на каждый день" : "Что надеть сегодня и в ближайшие дни"}</p>
        </div>
        {tab !== "weather" && <button className="btn btn-primary title-action"
          aria-label={tab === "outfits" ? "Создать образ" : "Добавить вещь"}
          onClick={() => tab === "outfits" ? setBuilder({}) : addOwn()} disabled={!loaded}>
          <Plus/><span>{tab === "outfits" ? "Создать образ" : "Добавить вещь"}</span>
        </button>}
      </div>
      {loadError && <div className="error-panel" role="alert">
        <Info/><div><strong>Не удалось открыть гардероб</strong><p>{loadError}</p></div>
        <button className="btn" onClick={retryLoad}>Повторить</button>
      </div>}
      <WardrobeSection items={visibleItems} city={city} weather={weather}
        weatherBusy={weatherBusy} weatherError={weatherError} demo={demo}
        loading={loading} loadError={loadError} loaded={loaded} gender={gender}
        category={category} onCategoryChange={setCategory}
        onWeatherOpen={() => setTab("weather")} onWeatherRetry={refreshWeather}
        onAddOwn={addOwn} onEdit={item => setEditor({ item })} onBuild={setBuilder}
        onDelete={item => confirmDelete("item", item)}/>
      <TabsContent value="outfits"><OutfitsSection items={visibleItems}
        outfits={visibleOutfits} outfitItems={outfitItems} gender={gender}
        demo={demo} loading={loading} error={loadError} onOpen={setBuilder}
        onAddOwn={addOwn} onDelete={outfit => confirmDelete("outfit", outfit)}/></TabsContent>
      <WeatherSection city={city} weather={weather} weatherBusy={weatherBusy}
        weatherError={weatherError} day={day} selectedWeather={selectedWeather}
        recommendation={recommendation} suitableOutfits={suitableOutfits}
        visibleOutfits={visibleOutfits} outfitItems={outfitItems} gender={gender}
        demo={demo} onAddOwn={addOwn} onCityOpen={() => setCityOpen(true)}
        onRefresh={refreshWeather} onDayChange={next => { setDay(next); setVariation(0); }}
        onNextVariation={() => setVariation(value => value + 1)}
        onEdit={item => setEditor({ item })} onBuild={setBuilder}/>
      <footer className="app-footer">
        <div className="footer-brand">форма</div>
        <span>{items.length} своих вещей · {outfits.length} образов</span>
      </footer>
    </main>

    {editor && <ItemEditor key={editor.item?.id ?? "new"} item={editor.item}
      gender={gender} onClose={() => setEditor(null)} onSaved={savedItem}
      onDelete={item => { setEditor(null); confirmDelete("item", item); }}
      onAddOwn={() => setEditor({ item: null })}/>}
    {builder && <OutfitEditor items={visibleItems} initial={builder} demo={demo}
      gender={gender} onClose={() => setBuilder(null)} onSaved={savedOutfit} onAddOwn={addOwn}/>}
    {cityOpen && <CityPicker onClose={() => setCityOpen(false)} onSelect={changeCity}/>}
    {loaded && profileOpen && <ProfileEditor key={profile?.name ?? "new-profile"}
      profile={profile} initialName={initialName} onClose={() => setProfileOpen(false)}
      onSaved={savedProfile}/>}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !deleteBusy) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogTitle>Удалить «{deleting?.name}»?</AlertDialogTitle>
        <AlertDialogDescription>{deleting?.type === "item"
          ? "Фото будет удалено. Сохранённые образы останутся, но этой вещи в них больше не будет."
          : "Вещи из образа останутся в гардеробе."}</AlertDialogDescription>
        {deleteError && <p role="alert" className="form-error">{deleteError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteBusy}>Отмена</AlertDialogCancel>
          <AlertDialogAction className="delete-confirm" disabled={deleteBusy}
            onClick={event => { event.preventDefault(); void remove(); }}>
            {deleteBusy ? "Удаляем…" : "Удалить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Tabs>;
}
