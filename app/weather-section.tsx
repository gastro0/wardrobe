import {
  ArrowUpRight, Check, ChevronDown, CloudSun, Droplets, Info,
  Layers, MapPin, Plus, RefreshCw, Shirt as Hanger, Shirt,
} from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  degree, recommend, weatherAdvice, weatherLabel,
  type City, type Conditions, type Gender, type Item, type Outfit, type Weather,
} from "@/lib/wardrobe";
import OutfitCollage from "./outfit-collage";
import { Photo, WeatherIcon } from "./wardrobe-visuals";

type Props = {
  city: City;
  weather: Weather | null;
  weatherBusy: boolean;
  weatherError: string;
  day: number;
  selectedWeather: Conditions | null;
  recommendation: ReturnType<typeof recommend> | null;
  suitableOutfits: Outfit[];
  visibleOutfits: Outfit[];
  outfitItems: Map<string, Item[]>;
  gender: Gender;
  demo: boolean;
  onAddOwn: () => void;
  onCityOpen: () => void;
  onRefresh: () => void;
  onDayChange: (day: number) => void;
  onNextVariation: () => void;
  onEdit: (item: Item) => void;
  onBuild: (outfit: Partial<Outfit>) => void;
};

export default function WeatherSection({
  city, weather, weatherBusy, weatherError, day, selectedWeather, recommendation,
  suitableOutfits, visibleOutfits, outfitItems, gender, demo, onAddOwn,
  onCityOpen, onRefresh, onDayChange, onNextVariation, onEdit, onBuild,
}: Props) {
  return <TabsContent value="weather">
    {demo && <div className="demo-note">
      <span><Info size={16}/>Сейчас подбор работает на примере коллекции.</span>
      <button onClick={onAddOwn}>Добавить свои вещи<Plus size={14}/></button>
    </div>}
    <div className="weather-page-heading">
      <button className="btn city-selector" onClick={onCityOpen}><MapPin/>{city.name}<ChevronDown size={15}/></button>
      <button className="text-button" onClick={onRefresh} disabled={weatherBusy}>
        <RefreshCw size={15} className={weatherBusy ? "spin" : ""}/>Обновить
      </button>
    </div>
    {weatherError && <div className="error-panel" role="alert">
      <CloudSun/><p>{weatherError}</p>
      <button className="btn" onClick={onRefresh} disabled={weatherBusy}>Повторить</button>
    </div>}
    {weather && selectedWeather ? <>
      <div className="forecast-grid">
        {weather.days.map((forecast, index) => <button key={forecast.date}
          className={`forecast-day ${day === index ? "selected-day" : ""}`}
          onClick={() => onDayChange(index)} aria-pressed={day === index}>
          <div className="forecast-day-name">
            {index === 0 ? "Сегодня" : index === 1 ? "Завтра"
              : new Date(forecast.date + "T12:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
            <span>{index === 0 ? "сейчас" : "днём"}</span>
          </div>
          <WeatherIcon code={index === 0 ? weather.current.code : forecast.code}
            isDay={index === 0 ? weather.current.isDay : true}/>
          <strong>{degree(index === 0 ? weather.current.temperature : forecast.max)}</strong>
          <div className="forecast-day-meta">
            <span>Мин. {degree(forecast.min)}</span>
            <span><Droplets size={12}/>{forecast.probability === null ? "Нет данных" : `${Math.round(forecast.probability)}%`}</span>
          </div>
        </button>)}
      </div>
      <div className="recommendation-layout">
        <section className="weather-advice surface">
          <div className="eyebrow">На выбранный день</div>
          <h2>{selectedWeather.feels >= 22 ? "Полегче и посвободнее"
            : selectedWeather.feels >= 15 ? "Возьмите ещё один слой" : "Самое время утеплиться"}</h2>
          <p className="feels-detail">Ощущается как {degree(selectedWeather.feels)} · {weatherLabel(selectedWeather.code, selectedWeather.isDay)}</p>
          <div className="advice-lines">{weatherAdvice(selectedWeather, gender).map((line, index) =>
            <p key={line}><span>{index === 0 ? <Shirt size={19}/> : <CloudSun size={19}/>}</span>{line}</p>)}
          </div>
          <div className="weather-source">
            <span>{weather.stale ? "Показан ранее загруженный прогноз. Обновление пока недоступно." : "Автообновление каждые 15 минут"}</span>
            <span>Прогноз на {weather.time.replace("T", " ").slice(0, 16)} · {weather.timezone}</span>
            <a href={weather.source === "met-no" ? "https://api.met.no/" : "https://open-meteo.com/"}
              target="_blank" rel="noreferrer">Данные {weather.source === "met-no" ? "MET Norway" : "Open-Meteo"} ↗</a>
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
            {weather.source === "met-no" && <span>Суточные значения собраны из прогноза по часам.
              {weather.feelsEstimated ? " При отсутствии ощущаемой температуры используется температура воздуха." : ""}
            </span>}
          </div>
        </section>
        <section className="recommendation surface">
          <div className="recommendation-heading">
            <div><div className="eyebrow">{demo ? "На примере коллекции" : "Из вашего гардероба"}</div>
              <h2>{day === 0 ? "Образ на сегодня" : "Образ на день"}</h2></div>
            <span className={`match-badge ${recommendation?.complete ? "" : "match-warning"}`}>
              {recommendation?.complete ? <><Check size={14}/>По погоде</> : "Можно дополнить"}
            </span>
          </div>
          {recommendation?.items.length ? <>
            <div className="recommendation-items">
              {recommendation.items.map(item => <button className="recommended-piece" key={item.id}
                onClick={() => onEdit(item)}><Photo item={item}/><span>{item.name}</span></button>)}
            </div>
            {recommendation.missing.length > 0 && <p className="recommendation-notice">
              <Info size={16}/>Не хватает вещей для этой погоды: {recommendation.missing.join(", ")}. Добавьте их или измените температурные отметки.
            </p>}
            {recommendation.warnings.map(warning => <p className="recommendation-notice" key={warning}>
              <Info size={16}/>{warning}
            </p>)}
            <div className="recommendation-actions">
              <button className="btn btn-primary" onClick={() => onBuild({
                name: day === 0 ? "Образ на сегодня" : "Образ на день",
                itemIds: recommendation.items.map(item => item.id),
              })}><Layers/>Открыть в конструкторе</button>
              <button className="btn" onClick={onNextVariation}><RefreshCw/>Другой вариант</button>
            </div>
            <p className="field-help">Варианты зависят от состава гардероба. Подбор учитывает ваши отметки, а не материал на фото.</p>
          </> : <Empty>
            <EmptyHeader><Hanger size={35}/><EmptyTitle>Нужны вещи для этой погоды</EmptyTitle>
              <EmptyDescription>Добавьте подходящие вещи и укажите комфортный диапазон температуры.</EmptyDescription></EmptyHeader>
            <EmptyContent><button className="btn btn-primary" onClick={onAddOwn}><Plus/>Добавить вещь</button></EmptyContent>
          </Empty>}
        </section>
      </div>
      {visibleOutfits.length > 0 && <section className="suitable-outfits">
        <div className="collection-heading"><h2>Подходящие сохранённые образы</h2></div>
        {suitableOutfits.length
          ? <div className="outfits-grid">{suitableOutfits.map(outfit => <button
            className="saved-outfit surface saved-outfit-weather" key={outfit.id} onClick={() => onBuild(outfit)}>
            <OutfitCollage items={outfitItems.get(outfit.id) ?? []}/>
            <div className="saved-outfit-info"><h2>{outfit.name}</h2><ArrowUpRight size={20}/></div>
          </button>)}</div>
          : <p className="muted">Пока нет сохранённых образов с подходящей температурой. Сохраните сочетание из конструктора.</p>}
      </section>}
    </> : !weatherError && <div className="forecast-grid">
      {[1, 2, 3, 4, 5].map(index => <Skeleton key={index} className="h-44 rounded-xl"/>)}
    </div>}
  </TabsContent>;
}
