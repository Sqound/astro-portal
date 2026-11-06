"use client";

// The data of the calendar with the forecast band: the
// place's forecast through the page's shared request (`requestAstronomyWeather`
// keeps one answer per place, so moving the window or choosing a date never
// asks again) and the measured months the window shows, loaded one at a
// time when it reaches them (`requestAstronomyWeatherHistory`), kept for the
// page. Past nights only with "Planification avancée" (`pastAllowed`).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestAstronomyWeather,
  requestAstronomyWeatherHistory,
} from "portal/astronomy-weather.js";
import { conditionsCalendar, conditionsToday } from "../conditions-calendar.js";

const coordinatesOf = (place) => {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  return place &&
    String(place.latitude ?? "").trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
};

const offlineError = (error) =>
  error instanceof TypeError ||
  (typeof navigator !== "undefined" && navigator.onLine === false);

export function useConditionsCalendar({
  place,
  offset = 0,
  pastAllowed = false,
  retry = 0,
}) {
  const coordinates = coordinatesOf(place);
  const key = coordinates
    ? `${coordinates.latitude}|${coordinates.longitude}`
    : "";
  const today = useMemo(
    () => conditionsToday({ place }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, place?.timeZone],
  );
  const [forecast, setForecast] = useState({ status: "idle" });
  const [history, setHistory] = useState({});
  useEffect(() => {
    setHistory({});
  }, [key]);
  useEffect(() => {
    if (!coordinates) {
      setForecast({ status: "idle" });
      return undefined;
    }
    const controller = new AbortController();
    setForecast({ status: "loading" });
    requestAstronomyWeather(coordinates, {
      signal: controller.signal,
      refresh: retry > 0,
    })
      .then((payload) => {
        if (!controller.signal.aborted)
          setForecast({ status: "ready", payload });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setForecast({
            status: offlineError(error) ? "offline" : "unavailable",
          });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const calendar = conditionsCalendar({
    today,
    offset,
    place: coordinates ? place : null,
    forecast,
    history,
    pastAllowed: pastAllowed && Boolean(coordinates),
  });
  const wanted = (calendar?.pastMonths || []).filter(
    (month) => !history[month] || history[month].status === "retry",
  );
  const inFlight = useRef(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // One month at a time: the first one the window still lacks.
    const month = wanted.find(
      (entry) => !inFlight.current.has(`${key}|${entry}`),
    );
    if (!coordinates || !month || inFlight.current.size) return;
    const flight = `${key}|${month}`;
    inFlight.current.add(flight);
    setHistory((current) => ({ ...current, [month]: { status: "loading" } }));
    const settle = (read) => {
      inFlight.current.delete(flight);
      if (mounted.current)
        setHistory((current) => ({ ...current, [month]: read }));
    };
    requestAstronomyWeatherHistory(coordinates, month)
      .then((payload) => settle({ status: "ready", payload }))
      .catch(() => settle({ status: "unavailable" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wanted.join(","), history]);
  const retryHistory = () =>
    setHistory((current) =>
      Object.fromEntries(
        Object.entries(current).map(([month, read]) => [
          month,
          read.status === "unavailable" ? { status: "retry" } : read,
        ]),
      ),
    );
  return { calendar, today, forecast, history, retryHistory };
}
