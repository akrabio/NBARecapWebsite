"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ChevronRight, Share } from "lucide-react";
import TeamLogo from "@/components/ui/TeamLogo";
import { toast } from "@/components/ui/Toast";
import RecapBody from "./RecapBody";
import BoxScore from "./BoxScore";
import LineScore from "./LineScore";
import GameFlow from "./GameFlow";
import { navState } from "@/lib/navState";
import { parseRecap } from "@/lib/recap";
import { formatLongDate } from "@/lib/dates";
import { getBoxScore } from "@/utils/api";
import { getTags } from "@/utils/gameStory";
import { formatRecord, formatScore, getWinner, matchupText } from "@/utils/gameUtils";
import { matchupColors } from "@/utils/teamColors";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const TABS = [
  ["recap", "סיכום"],
  ["box", "נתונים"],
  ["replay", "שחזור"],
];

// Replay UI + data load on demand: the chunk is requested only when the
// replay tab is first selected (readers who stay in recap/stats never load it).
const ReplayView = dynamic(() => import("./replay/ReplayView"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-[15px] text-body">טוען שחזור…</p>,
});

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
  const winner = getWinner(game);
  return (
    <div className={`flex items-center gap-2 font-black tabular-nums ${className}`}>
      <span className={winner === "home" ? "text-faint" : ""}>{formatScore(game.away_score)}</span>
      <i className="text-[0.45em] not-italic text-faint">–</i>
      <span className={winner === "away" ? "text-faint" : ""}>{formatScore(game.home_score)}</span>
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
          {matchupText(game, shortName)}
        </b>
      </div>
    </Link>
  );
}

export default function GameView({ game, media, siblings }) {
  const router = useRouter();
  const recap = useMemo(() => parseRecap(game.content), [game.content]);
  // The series tag below already says "playoffs"
  const tags = getTags(game, { omit: recap.series ? ["playoffs"] : [] });
  const [tab, setTab] = useState("recap");
  // Game id whose replay view has been opened; kept mounted (hidden) after.
  const [replayOpenedFor, setReplayOpenedFor] = useState(null);
  // (Game changed while the replay tab is open: adopt it, so it stays mounted.)
  if (tab === "replay" && replayOpenedFor !== game.id) setReplayOpenedFor(game.id);
  const replayMounted = tab === "replay" || replayOpenedFor === game.id;
  const [summary, setSummary] = useState({ status: game.espn_game_id ? "loading" : "missing" });
  const [showLines, setShowLines] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  // Callback ref: the hero unmounts on the replay tab and returns afterwards.
  const [heroEl, setHeroEl] = useState(null);
  const progressRef = useRef(null);
  const tabsRef = useRef(null);
  // Set by switchTab: keep the tabs pinned under the top bar after the switch.
  const pinTabsRef = useRef(false);
  // Replay mode: the running replay scoreboard is the only score on the page,
  // so the final-score hero and the top bar's compact final score are hidden.
  const replayMode = tab === "replay";

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

  // Compact score in the top bar once the hero scrolls away. Re-attached
  // whenever the hero node mounts (it is absent on the replay tab); the
  // observer's first callback reports the returning hero's real position.
  useEffect(() => {
    if (!heroEl) return undefined;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), {
      rootMargin: "-52px 0px 0px 0px",
    });
    observer.observe(heroEl);
    return () => {
      observer.disconnect();
      setHeroVisible(true);
    };
  }, [heroEl]);

  // After a tab switch (the hero may have appeared or disappeared above the
  // tabs), keep the tabs pinned under the top bar if they were pinned before.
  useLayoutEffect(() => {
    if (!pinTabsRef.current) return;
    pinTabsRef.current = false;
    window.scrollTo(0, tabsRef.current.getBoundingClientRect().top + window.scrollY - 52);
  }, [tab]);

  // Reading progress. Written straight to the bar (no state), so scrolling
  // doesn't re-render the recap.
  useEffect(() => {
    const bar = progressRef.current;
    if (tab !== "recap") {
      bar.style.width = "0";
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = `${max > 0 ? Math.min(1, window.scrollY / max) * 100 : 0}%`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
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
    if (next === "replay") setReplayOpenedFor(game.id);
    // Keep the tabs pinned where they are instead of jumping to the top
    // (applied after render, once the header for the new tab is laid out).
    const tabsTop = tabsRef.current.getBoundingClientRect().top + window.scrollY - 52;
    pinTabsRef.current = next !== tab && window.scrollY > tabsTop;
  };

  // Arrow keys move between tabs (reversed, since the page is right-to-left).
  const onTabsKeyDown = (e) => {
    const step = { ArrowLeft: 1, ArrowRight: -1, Home: -TABS.length, End: TABS.length }[e.key];
    if (!step) return;
    e.preventDefault();
    const current = TABS.findIndex(([key]) => key === tab);
    const [next] = TABS[Math.min(TABS.length - 1, Math.max(0, current + step))];
    switchTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const index = siblings.findIndex((g) => g.id === game.id);
  const { away: awayColor, home: homeColor } = matchupColors(game.away_team, game.home_team);
  const hasLines = summary.status === "ready" && summary.linescores?.length === 2;

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b bg-[color-mix(in_srgb,var(--app-bg)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto grid h-[52px] max-w-[760px] grid-cols-[1fr_auto_1fr] items-center px-1">
          <button onClick={goBack} className="flex h-11 items-center gap-0.5 justify-self-start px-2 text-[15px] font-bold text-brand-ink lg:invisible">
            <ChevronRight className="h-5 w-5" />
            משחקים
          </button>
          {replayMode ? (
            // Game identity only — never the final result while replaying.
            <div className="flex min-w-0 flex-col items-center leading-tight">
              <div className="flex items-center gap-1.5 text-[13.5px] font-bold">
                <TeamLogo teamName={game.away_team} hebrewName={nbaEnToHe[game.away_team]} alt="" size="xs" />
                <span className="truncate">{matchupText({ ...game, home_score: null, away_score: null }, shortName)}</span>
                <TeamLogo teamName={game.home_team} hebrewName={nbaEnToHe[game.home_team]} alt="" size="xs" />
              </div>
              <small className="text-[11px] text-subtle">{formatLongDate(game.date)}</small>
            </div>
          ) : (
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${heroVisible ? "opacity-0" : "opacity-100"}`} aria-hidden={heroVisible}>
              <TeamLogo teamName={game.away_team} hebrewName={nbaEnToHe[game.away_team]} alt={nbaEnToHe[game.away_team]} size="xs" />
              <Score game={game} className="text-[15px]" />
              <TeamLogo teamName={game.home_team} hebrewName={nbaEnToHe[game.home_team]} alt={nbaEnToHe[game.home_team]} size="xs" />
            </div>
          )}
          <button onClick={share} aria-label="שיתוף" className="grid h-11 w-11 place-items-center justify-self-end rounded-xl text-subtle">
            <Share className="h-5 w-5" />
          </button>
        </div>
        <div ref={progressRef} className="absolute bottom-[-1px] right-0 h-0.5 w-0 bg-brand" />
      </div>

      {/* Page heading, outside the hero so it survives the replay tab (which
          names the teams only — the result is not revealed while replaying). */}
      <h1 className="sr-only">
        {matchupText(replayMode ? { ...game, home_score: null, away_score: null } : game, (team) => nbaEnToHe[team] || team)}
      </h1>

      {/* Compact score header: one row, so the recap starts above the fold.
          Not rendered on the replay tab: the running replay scoreboard replaces it. */}
      {!replayMode && (
        <div
          ref={setHeroEl}
          className="px-4 pt-1.5 pb-3"
          style={{
            background: `linear-gradient(105deg, color-mix(in srgb, ${awayColor} 22%, var(--app-bg)), var(--app-bg) 45%, var(--app-bg) 55%, color-mix(in srgb, ${homeColor} 22%, var(--app-bg)))`,
          }}
        >
          <div className="mx-auto max-w-[696px]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <HeroTeam team={game.away_team} record={formatRecord(game.title, game.away_team)} />
              <Score game={game} className="text-[32px] lg:text-[42px]" />
              <HeroTeam team={game.home_team} record={formatRecord(game.title, game.home_team)} reverse />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12.5px] text-subtle">
              <span>{formatLongDate(game.date)}</span>
              {tags.map((tag) => (
                <span key={tag.key + tag.label} className={`tag tag-${tag.key}`}>
                  {tag.label}
                </span>
              ))}
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
      )}

      {/* Tabs */}
      <div ref={tabsRef} className="sticky top-[52px] z-20 border-b bg-app">
        <div className="mx-auto flex max-w-[696px]" role="tablist" aria-label="תוכן המשחק" onKeyDown={onTabsKeyDown}>
          {TABS.map(([key, label]) => (
            <button
              key={key}
              id={`tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls={key === "replay" ? "game-tabpanel-replay" : "game-tabpanel"}
              tabIndex={tab === key ? 0 : -1}
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

      <div
        id="game-tabpanel"
        role="tabpanel"
        aria-labelledby={tab === "box" ? "tab-box" : "tab-recap"}
        hidden={tab === "replay"}
        className="mx-auto max-w-[680px] px-4 pt-4 pb-[calc(40px+env(safe-area-inset-bottom))]"
      >
        {/* Explicit per-tab content. Kept in the DOM (empty, hidden) on the replay
            tab so every tab's aria-controls resolves; replay content lives only in
            #game-tabpanel-replay and can never render the final box score. */}
        {tab === "recap" && (
          <>
            {game.headline && <h2 className="text-[22px] leading-snug font-black lg:text-[26px]">{game.headline}</h2>}
            {game.one_liner && <p className="mt-2 mb-5 text-[17px] leading-relaxed text-body">{game.one_liner}</p>}
            <RecapBody game={game} recap={recap} media={media} />
            <GameFlow game={game} />
            {siblings.length > 1 && (
              <nav className="mt-7 grid grid-cols-2 gap-2 lg:hidden" aria-label="משחקים נוספים מאותו יום">
                <PagerLink game={siblings[index - 1]} label="› הקודם" />
                <PagerLink game={siblings[index + 1]} label="הבא ‹" align="end" />
              </nav>
            )}
          </>
        )}
        {tab === "box" && <BoxScore game={game} summary={summary} />}
      </div>

      {/* Always present (empty until first opened) so aria-controls resolves */}
      <div
        id="game-tabpanel-replay"
        role="tabpanel"
        aria-labelledby="tab-replay"
        hidden={tab !== "replay"}
        inert={tab !== "replay"}
        className="mx-auto max-w-[680px] px-4 pt-4 pb-[calc(40px+env(safe-area-inset-bottom))]"
      >
        {replayMounted && <ReplayView key={game.id} game={game} active={tab === "replay"} onSelectTab={switchTab} />}
      </div>
    </div>
  );
}
