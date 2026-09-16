import {useMemo} from "react";
import {categoryAllowed, outfitSuitable, recommend, type Conditions, type Gender, type Item, type Outfit, type Weather} from "@/lib/wardrobe";

export function useWardrobeView(items: Item[], outfits: Outfit[], gender: Gender, weather: Weather | null, day: number, variation: number) {
  const visibleItems = useMemo(() => items.filter(item => categoryAllowed(item.category, gender)), [items, gender]);
  const visibleOutfits = useMemo(() => {
    const hiddenIds = new Set(items.filter(item => !categoryAllowed(item.category, gender)).map(item => item.id));
    return outfits.filter(outfit => !outfit.itemIds.some(id => hiddenIds.has(id)));
  }, [items, outfits, gender]);
  const outfitItems = useMemo(() => {
    // Retain wardrobe order while resolving each saved outfit only once.
    const index = new Map(visibleItems.map((item, order) => [item.id, {item, order}]));
    return new Map(visibleOutfits.map(outfit => {
      const pieces = [...new Set(outfit.itemIds)].flatMap(id => index.get(id) ?? []);
      return [outfit.id, pieces.sort((a, b) => a.order - b.order).map(entry => entry.item)];
    }));
  }, [visibleItems, visibleOutfits]);
  const selectedWeather = useMemo<Conditions | null>(() => {
    if (!weather) return null;
    const forecast = weather.days[day];
    if (day === 0 || !forecast) return weather.current;
    return {temperature: forecast.max, feels: forecast.feels, code: forecast.code, wind: forecast.wind, rain: forecast.rain, probability: forecast.probability, isDay: true};
  }, [weather, day]);
  const recommendation = useMemo(() => selectedWeather ? recommend(visibleItems, selectedWeather, variation, gender) : null, [visibleItems, selectedWeather, variation, gender]);
  const suitableOutfits = useMemo(() => selectedWeather ? visibleOutfits.filter(outfit => {
    const pieces = outfitItems.get(outfit.id)!;
    return pieces.length === outfit.itemIds.length && outfitSuitable(pieces, selectedWeather, gender);
  }) : [], [visibleOutfits, outfitItems, selectedWeather, gender]);

  return {visibleItems, visibleOutfits, outfitItems, selectedWeather, recommendation, suitableOutfits};
}
