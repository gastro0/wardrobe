"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {api} from "@/lib/client";
import type {City, Weather} from "@/lib/wardrobe";

const REQUEST_TIMEOUT = 25_000;
const REFRESH_INTERVAL = 15 * 60 * 1000;
const STALE_LIMIT = 2 * 60 * 60 * 1000;

export function useWeather(city: City) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [day, setDay] = useState(0);
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const refreshWeather = useCallback(async () => {
    const sequence = ++requestSequence.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    setWeatherBusy(true);
    setWeatherError("");
    try {
      const next = await api<Weather>(`/api/weather?lat=${city.latitude}&lon=${city.longitude}&city=${encodeURIComponent(city.name)}`, {signal: controller.signal});
      if (sequence === requestSequence.current) {
        setWeather(next);
        setDay(value => Math.max(0, Math.min(value, next.days.length - 1)));
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setWeather(old => old && Date.now() - Date.parse(old.fetchedAt) < STALE_LIMIT ? {...old, stale: true} : null);
        setWeatherError(controller.signal.aborted ? "Сервис погоды не ответил вовремя. Попробуйте ещё раз." : (error as Error).message);
      }
    } finally {
      clearTimeout(timeout);
      if (sequence === requestSequence.current) {
        setWeatherBusy(false);
        activeController.current = null;
      }
    }
  }, [city.latitude, city.longitude, city.name]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setWeather(null);
      setDay(0);
      void refreshWeather();
    });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshWeather();
    };
    const timer = setInterval(refreshWhenVisible, REFRESH_INTERVAL);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      // Responses from the previous city or an unmounted view must be ignored.
      requestSequence.current++;
      activeController.current?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshWeather]);

  return {weather, weatherBusy, weatherError, day, setDay, refreshWeather};
}
