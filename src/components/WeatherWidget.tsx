"use client";

import { useEffect, useState } from "react";

// WMO weather codes (https://open-meteo.com/en/docs) collapsed into the few buckets we show.
function describeWeather(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Sunny", icon: "☀️" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", icon: "⛅" };
  if (code === 3) return { label: "Cloudy", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "🌫️" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "❄️" };
  if (code >= 85 && code <= 86) return { label: "Snow", icon: "❄️" };
  if (code >= 95) return { label: "Storms", icon: "⛈️" };
  // 51–67 drizzle/rain, 80–82 showers
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rain", icon: "🌧️" };
  return { label: "—", icon: "·" };
}

type DayForecast = {
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProb: number | null;
};

type Status = "loading" | "denied" | "error" | "ready";

// Build the 7 dates of the planned week as YYYY-MM-DD strings, matching Open-Meteo's local dates.
function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  const [y, m, d] = weekStart.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
      dt.getDate(),
    ).padStart(2, "0")}`;
    out.push(iso);
  }
  return out;
}

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

export default function WeatherWidget({ weekStart }: { weekStart: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [forecast, setForecast] = useState<Record<string, DayForecast>>({});

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
            `&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const daily = data.daily;
          const map: Record<string, DayForecast> = {};
          for (let i = 0; i < daily.time.length; i++) {
            map[daily.time[i]] = {
              weatherCode: daily.weather_code[i],
              tempMax: Math.round(daily.temperature_2m_max[i]),
              tempMin: Math.round(daily.temperature_2m_min[i]),
              precipProb: daily.precipitation_probability_max?.[i] ?? null,
            };
          }
          if (!cancelled) {
            setForecast(map);
            setStatus("ready");
          }
        } catch {
          if (!cancelled) setStatus("error");
        }
      },
      () => {
        if (!cancelled) setStatus("denied");
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const shell = "card p-4";

  if (status === "loading") {
    return (
      <div className={shell}>
        <p className="text-sm text-gray-500">Loading forecast…</p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={shell}>
        <p className="text-sm text-gray-500">
          Allow location access to see this week&apos;s forecast while you plan.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={shell}>
        <p className="text-sm text-gray-500">Couldn&apos;t load the weather right now.</p>
      </div>
    );
  }

  const dates = weekDates(weekStart);
  const hasAny = dates.some((iso) => forecast[iso]);

  return (
    <div className={shell}>
      <h2 className="mb-3 text-sm font-medium text-gray-700">This week&apos;s weather</h2>
      {hasAny ? (
        <div className="grid grid-cols-7 gap-2">
          {dates.map((iso) => {
            const day = forecast[iso];
            const cond = day ? describeWeather(day.weatherCode) : null;
            return (
              <div
                key={iso}
                className="flex flex-col items-center gap-0.5 rounded border border-gray-100 bg-gray-50 px-1 py-2 text-center"
              >
                <span className="text-xs font-medium text-gray-500">{weekdayLabel(iso)}</span>
                {day && cond ? (
                  <>
                    <span className="text-xl leading-none" title={cond.label}>
                      {cond.icon}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{day.tempMax}°</span>
                    <span className="text-xs text-gray-400">{day.tempMin}°</span>
                    {day.precipProb != null && day.precipProb > 20 ? (
                      <span className="text-xs text-blue-500">{day.precipProb}%</span>
                    ) : null}
                  </>
                ) : (
                  <span className="mt-1 text-xs text-gray-300">—</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Forecast not available this far out.</p>
      )}
    </div>
  );
}
