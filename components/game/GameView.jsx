"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Share } from "lucide-react";
import TeamLogo from "@/components/ui/TeamLogo";
import { toast } from "@/components/ui/Toast";
import RecapBody from "./RecapBody";
import BoxScore from "./BoxScore";
import LineScore from "./LineScore";
import { navState } from "@/lib/navState";
import { parseRecap } from "@/lib/recap";
import { formatLongDate } from "@/lib/dates";
import { getBoxScore } from "@/utils/api";
import { getGameReason } from "@/utils/gameScoring";
import { extractRecord } from "@/utils/gameUtils";
import { getTeamColors } from "@/utils/teamColors";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const shortName = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

function HeroTeam({ team, record, reverse }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${reverse ? "flex-row-reverse text-left" : ""}`}>
      <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} size="md" className="!h-10 !w-10 shrink-0 lg:!h-14 lg:!w-14" />
      <div className="min-w-0">
        <b className="block truncate text-[15px] font-extrabold lg:text-lg">{shortName(team)}</b>
        {record && <small className="text-xs text-subtle">{record}</small>}
      </div>
    </div>
  );
}

function Score({ game, className = "" }) {
  const homeWon = game.home_score > game.away_score;
  return (
    <div className={`flex items-center gap-2 font-black tabular-nums ${className}`}>
      <span className={homeWon ? "text-faint" : ""}>{game.away_score}</span>
      <i className="text-[0.45em] not-italic text-faint">–</i>
      <span className={homeWon ? "" : "text-faint"}>{game.home_score}</span>
    </div>
  );
}

function PagerLink({ game, label, align }) {
  if (!game) return <span />;
  return (
    <Link
      href={`/game/${game.id}`}
      replace
      className={`flex min-h-14 min-w-0 items-center gap-2 rounded-[14px] border bg-surface px-3 py-2 ${
        align === "end" ? "flex-row-reverse text-left" : ""
      }`}
    >
      <TeamLogo teamName={game.away_team} hebrewName={nbaEnToHe[game.away_team]} size="xs" className="shrink-0" />
      <div className="min-w-0">
        <small className="block text-[11.5px] text-subtle">{label}</small>
        <b className="block truncate text-[13.5px]">
          {shortName(game.away_team)} {game.away_score}–{game.home_score} {shortName(game.home_team)}
        </b>
      </div>
    </Link>
  );
}

export default function GameView({ game, siblings }) {
  const router = useRouter();
  const recap = useMemo(() => parseRecap(game.content), [game.content]);
  const reason = getGameReason(game);
  const [tab, setTab] = useState("recap");
  const [summary, setSummary] = useState({ status: game.espn_game_id ? "loading" : "missing" });
  const [showLines, setShowLines] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const heroRef = useRef(null);
  const tabsRef = useRef(null);

  // Box score + quarter scores (one ESPN request, shared by both tabs)
  useEffect(() => {
    if (!game.espn_game_id) return;
    let cancelled = false;
    getBoxScore(game.espn_game_id)
      .then((data) => !cancelled && setSummary({ status: "ready", ...data }))
      .catch(() => !cancelled && setSummary({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [game.espn_game_id]);

  // Compact score in the top bar once the hero scrolls away
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), {
      rootMargin: "-52px 0px 0px 0px",
    });
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Reading progress
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);

  // Desktop: ↑ / ↓ move through the list beside the recap
  useEffect(() => {
    const onKey = (e) => {
      if (!["ArrowUp", "ArrowDown"].includes(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || document.querySelector("[role=dialog]")) return;
      const index = siblings.findIndex((g) => g.id === game.id);
      const next = siblings[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      navState.cameFromList = true;
      router.push(`/game/${next.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game.id, siblings, router]);

  const goBack = () => {
    if (navState.cameFromList) router.back();
    else router.push(`/?date=${game.date}`);
  };

  const share = async () => {
    // The canonical game URL (the desktop home page previews a game at "/")
    const url = `${window.location.origin}/game/${game.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("הקישור הועתק");
      }
    } catch (error) {
      if (error?.name !== "AbortError") toast("לא ניתן לשתף כרגע");
    }
  };

  const switchTab = (next) => {
    setTab(next);
    // Keep the tabs pinned where they are instead of jumping to the top
    const tabsTop = tabsRef.current.getBoundingClientRect().top + window.scrollY - 52;
    if (window.scrollY > tabsTop) window.scrollTo(0, tabsTop);
  };

  const index = siblings.findIndex((g) => g.id === game.id);
  const awayColor = getTeamColors(game.away_team).primary;
  const homeColor = getTeamColors(game.home_team).primary;
  const hasLines = summary.status === "ready" && summary.linescores?.length === 2;

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b bg-[color-mix(in_srgb,var(--app-bg)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto grid h-[52px] max-w-[760px] grid-cols-[1fr_auto_1fr] items-center px-1">
          <button onClick={goBack} className="flex h-11 items-center gap-0.5 justify-self-start px-2 text-[15px] font-bold text-brand lg:invisible">
            <ChevronRight className="h-5 w-5" />
            משחקים
          </button>
          <div className={`flex items-center gap-2 transition-opacity duration-200 ${heroVisible ? "opacity-0" : "opacity-100"}`} aria-hidden={heroVisible}>
            <TeamLogo teamName={game.away_team} hebrewName={nbaEnToHe[game.away_team]} size="xs" />
            <Score game={game} className="text-[15px]" />
            <TeamLogo teamName={game.home_team} hebrewName={nbaEnToHe[game.home_team]} size="xs" />
          </div>
          <button onClick={share} aria-label="שיתוף" className="grid h-11 w-11 place-items-center justify-self-end rounded-xl text-subtle">
            <Share className="h-5 w-5" />
          </button>
        </div>
        <div className="absolute bottom-[-1px] right-0 h-0.5 bg-brand" style={{ width: tab === "recap" ? `${progress * 100}%` : 0 }} />
      </div>

      {/* Compact score header: one row, so the recap starts above the fold */}
      <div
        ref={heroRef}
        className="px-4 pt-1.5 pb-3"
        style={{
          background: `linear-gradient(105deg, color-mix(in srgb, ${awayColor} 22%, var(--app-bg)), var(--app-bg) 45%, var(--app-bg) 55%, color-mix(in srgb, ${homeColor} 22%, var(--app-bg)))`,
        }}
      >
        <div className="mx-auto max-w-[696px]">
          <h1 className="sr-only">
            {nbaEnToHe[game.away_team]} {game.away_score} – {game.home_score} {nbaEnToHe[game.home_team]}
          </h1>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <HeroTeam team={game.away_team} record={extractRecord(game.title, game.away_team)} />
            <Score game={game} className="text-[32px] lg:text-[42px]" />
            <HeroTeam team={game.home_team} record={extractRecord(game.title, game.home_team)} reverse />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12.5px] text-subtle">
            <span>{formatLongDate(game.date)}</span>
            {reason && <span className={`tag tag-${reason.key}`}>{reason.label}</span>}
            {recap.series && <span className="tag tag-playoffs">סדרה {recap.series}</span>}
            {hasLines && (
              <button
                onClick={() => setShowLines(!showLines)}
                aria-expanded={showLines}
                className="h-7 rounded-full border px-2.5 text-xs text-subtle"
              >
                לפי רבעים {showLines ? "▴" : "▾"}
              </button>
            )}
          </div>
          {hasLines && showLines && <LineScore game={game} linescores={summary.linescores} />}
        </div>
      </div>

      {/* Tabs */}
      <div ref={tabsRef} className="sticky top-[52px] z-20 border-b bg-app">
        <div className="mx-auto flex max-w-[696px]" role="tablist">
          {[
            ["recap", "סיכום"],
            ["box", "נתונים"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`-mb-px h-11 flex-1 border-b-2 text-[14.5px] font-bold ${
                tab === key ? "border-brand text-ink" : "border-transparent text-subtle"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[680px] px-4 pt-4 pb-[calc(40px+env(safe-area-inset-bottom))]">
        {tab === "recap" ? (
          <>
            <RecapBody game={game} recap={recap} />
            {siblings.length > 1 && (
              <nav className="mt-7 grid grid-cols-2 gap-2 lg:hidden" aria-label="משחקים נוספים מאותו יום">
                <PagerLink game={siblings[index - 1]} label="› הקודם" />
                <PagerLink game={siblings[index + 1]} label="הבא ‹" align="end" />
              </nav>
            )}
          </>
        ) : (
          <BoxScore game={game} summary={summary} />
        )}
      </div>
    </div>
  );
}
