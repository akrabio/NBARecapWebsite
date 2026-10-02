"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Play, Video } from "lucide-react";
import { parseDateKey } from "@/lib/dates";

// Highlights video inline in the recap. Looks the video up on mount so the
// thumbnail is ready, and only loads YouTube's player when tapped.
export default function VideoEmbed({ game, colors }) {
  const [state, setState] = useState({ status: "loading", videoId: null });
  const [playing, setPlaying] = useState(false);

  const query = `${game.away_team} vs ${game.home_team} highlights ${format(parseDateKey(game.date), "MMM dd yyyy")}`;
  const searchUrl = `https://www.youtube.com/@TheGametimeHighlights/search?query=${encodeURIComponent(query)}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => !cancelled && setState(data.videoId ? { status: "found", videoId: data.videoId } : { status: "missing" }))
      .catch(() => !cancelled && setState({ status: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (state.status === "missing") {
    return (
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-6 flex items-center gap-3 rounded-[14px] border bg-surface px-3.5 py-3 text-sm"
      >
        <Video className="h-5 w-5 shrink-0 text-[#ff0033]" />
        <span>
          <b className="block">תקציר וידאו</b>
          <span className="text-subtle">חפשו את התקציר ביוטיוב</span>
        </span>
      </a>
    );
  }

  const frame = "relative -mx-4 mb-6 block aspect-video w-[calc(100%+2rem)] overflow-hidden bg-black lg:mx-0 lg:w-full lg:rounded-2xl";

  if (playing) {
    return (
      <div className={frame}>
        <iframe
          className="absolute inset-0 h-full w-full border-0"
          src={`https://www.youtube.com/embed/${state.videoId}?autoplay=1&playsinline=1`}
          title="תקציר וידאו"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      disabled={state.status !== "found"}
      aria-label="נגן תקציר וידאו"
      className={frame}
      style={{ background: `radial-gradient(circle at 30% 40%, color-mix(in srgb, ${colors.away} 70%, #000), #000 75%)` }}
    >
      {state.videoId && (
        <img
          src={`https://i.ytimg.com/vi/${state.videoId}/hqdefault.jpg`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          loading="lazy"
        />
      )}
      <span className={`absolute inset-0 m-auto grid h-[62px] w-[62px] place-items-center rounded-full bg-[#ff0033] shadow-[0_8px_30px_rgba(255,0,51,.35)] ${state.status === "loading" ? "opacity-60" : ""}`}>
        <Play className="h-6 w-6 fill-white text-white" />
      </span>
      <span className="absolute inset-x-3 bottom-2.5 flex justify-between text-[13px] font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,.6)]">
        <span>תקציר וידאו</span>
        <span>יוטיוב</span>
      </span>
    </button>
  );
}
