"use client";

import { useState } from "react";
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun,
  Moon, Shirt, Sun,
} from "lucide-react";
import { weatherKind, type Item } from "@/lib/wardrobe";

export function WeatherIcon({ code = 0, isDay = true, className = "" }: {
  code?: number; isDay?: boolean; className?: string;
}) {
  const Icon = ({
    storm: CloudLightning, snow: CloudSnow, rain: CloudRain, fog: CloudFog,
    cloud: Cloud, partly: CloudSun, sun: isDay ? Sun : Moon,
  })[weatherKind(code)];
  return <Icon className={className} aria-hidden="true"/>;
}

export function Photo({ item, className = "" }: { item: Item; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className="photo-failed"><Shirt/><small>Не удалось загрузить фото</small></span>
    : <img className={className} src={item.image} alt={item.name} loading="lazy" onError={() => setFailed(true)}/>;
}

export const colours: Record<string, string> = {
  "Молочный": "#efe6cc", "Белый": "#fff", "Бежевый": "#c2a27d",
  "Чёрный": "#292a28", "Коричневый": "#825c43", "Серый": "#9d9d98",
  "Синий": "#354f70", "Голубой": "#94b6d2", "Зелёный": "#477a4f",
  "Оливковый": "#69734b", "Красный": "#b4473c", "Розовый": "#d497a3",
  "Жёлтый": "#d5b956", "Разноцветный": "linear-gradient(120deg,#c37c7b,#efc971,#8db3ad)",
};
