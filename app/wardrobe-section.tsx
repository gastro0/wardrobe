import { ArrowUpRight, Info, Layers, Pencil, Plus, RefreshCw, Shirt, Trash2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  availableCategories, categories, degree, suitable, weatherLabel,
  type City, type Conditions, type Gender, type Item, type Outfit, type Weather,
} from "@/lib/wardrobe";
import { colours, Photo, WeatherIcon } from "./wardrobe-visuals";

type Props = {
  items: Item[];
  city: City;
  weather: Weather | null;
  weatherBusy: boolean;
  weatherError: string;
  demo: boolean;
  loading: boolean;
  loadError: string;
  loaded: boolean;
  gender: Gender;
  category: string;
  onCategoryChange: (category: string) => void;
  onWeatherOpen: () => void;
  onWeatherRetry: () => void;
  onAddOwn: () => void;
  onEdit: (item: Item) => void;
  onBuild: (outfit: Partial<Outfit>) => void;
  onDelete: (item: Item) => void;
};

export default function WardrobeSection({
  items, city, weather, weatherBusy, weatherError, demo, loading, loadError, loaded,
  gender, category, onCategoryChange, onWeatherOpen, onWeatherRetry, onAddOwn,
  onEdit, onBuild, onDelete,
}: Props) {
  const current: Conditions | undefined = weather?.current;
  const filtered = items.filter(item => category === "all" || item.category === category);
  return <TabsContent value="wardrobe">
    <div className="weather-glance" aria-busy={weatherBusy}>
      <button className="weather-glance-main" onClick={onWeatherOpen} aria-label="Открыть прогноз и подобрать образ">
        <WeatherIcon code={current?.code ?? 2} isDay={current?.isDay ?? true}/>
        <span className="weather-glance-copy">
          <strong>{current ? `${degree(current.temperature)} · ${city.name}` : city.name}</strong>
          <span>{current
            ? `${weatherLabel(current.code, current.isDay)} · ощущается ${degree(current.feels)}${weather?.stale ? " · ранее загружено" : ""}`
            : weatherError ? "Прогноз недоступен" : "Загружаем погоду…"}</span>
        </span>
        <ArrowUpRight size={20}/>
      </button>
      {weatherError && <button className="weather-retry icon-button" aria-label="Повторить загрузку погоды"
        onClick={onWeatherRetry} disabled={weatherBusy}>
        <RefreshCw className={weatherBusy ? "spin" : ""}/>
      </button>}
    </div>

    <div className="collection-heading">
      <div><h2>{demo ? "Пример гардероба" : "Все ваши вещи"}<span className="count">{loading ? "—" : items.length}</span></h2></div>
      <button className="text-button" onClick={() => onBuild({})} disabled={!loaded || !items.length}>
        <Layers size={16}/>Собрать образ<ArrowUpRight size={16}/>
      </button>
    </div>
    <div className="category-filter">
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger aria-label="Категория вещей" className="category-filter-select"><SelectValue/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все вещи</SelectItem>
          {availableCategories(gender).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    {demo && !loading && <div className="demo-note">
      <span><Info size={16}/>Пока здесь примеры вещей.</span>
      <button onClick={onAddOwn}>Добавить свою<Plus size={14}/></button>
    </div>}

    {loading
      ? <div className="items-grid">{[1, 2, 3, 4, 5, 6].map(index => <div key={index}>
        <Skeleton className="h-64 rounded-xl"/><Skeleton className="mt-4 h-4 w-36"/>
      </div>)}</div>
      : !loadError && <div className="items-grid">
        {filtered.map(item => <article className="item-card" key={item.id}>
          <div className="item-image">
            <button className="item-open" onClick={() => onEdit(item)} aria-label={`Открыть ${item.name}`}>
              <Photo item={item}/>
            </button>
            <span className="category-badge">{categories[item.category]}</span>
            <button className="add-to-outfit" onClick={() => onBuild({ itemIds: [item.id] })}
              aria-label={`Добавить ${item.name} в образ`}><Plus size={17}/></button>
            {!demo && <button className="icon-button item-delete" title="Удалить вещь"
              aria-label={`Удалить ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={20}/></button>}
            {current && suitable(item, current) && <span className="weather-badge">
              <WeatherIcon code={current.code}/>{degree(item.minTemp)}…{degree(item.maxTemp)}
            </span>}
          </div>
          <div className="item-meta">
            <button className="item-name" onClick={() => onEdit(item)}>{item.name}</button>
            {!!item.tags?.length && <div className="tag-list item-tags" aria-label="Теги вещи">
              {item.tags.map(tag => <span className="clothing-tag" key={tag}>{tag}</span>)}
            </div>}
            <div className="item-detail">
              <span className="color-name"><i style={{ background: colours[item.color] ?? "#d5d8ce" }}/>{item.color}</span>
              <span>{degree(item.minTemp)} / {degree(item.maxTemp)}</span>
            </div>
            {!demo && <div className="item-actions"><button onClick={() => onEdit(item)}>
              <Pencil size={14}/>Изменить
            </button></div>}
          </div>
        </article>)}
        {category === "all" && <button className="add-item-card" onClick={onAddOwn}>
          <span className="add-round"><Plus size={27}/></span><strong>Новая вещь</strong><span>Добавить фото</span>
        </button>}
      </div>}
    {!loading && !loadError && !filtered.length && category !== "all" && <Empty className="surface">
      <EmptyHeader><Shirt size={34}/><EmptyTitle>Пока ничего в этой категории</EmptyTitle>
        <EmptyDescription>Добавьте вещь или посмотрите другие категории.</EmptyDescription></EmptyHeader>
      <EmptyContent><button className="btn btn-primary" onClick={onAddOwn}><Plus/>Добавить вещь</button></EmptyContent>
    </Empty>}
  </TabsContent>;
}
