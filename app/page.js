"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { motion } from "framer-motion";
// import GamesList from "../components/recap/GamesList";
import GamesList from "../components/recap/GamesListView";
import GameRecapView from "../components/recap/GameRecapView";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dribbble, Circle, ChevronLeft, ChevronRight, Calendar, TrendingUp, Check, ChevronsUpDown, X } from "lucide-react";
import { nbaEnToHe } from "@/utils/consts";
import useGameData from "@/hooks/useGameData";
import { GamesListSkeleton } from "@/components/ui/GameCardSkeleton";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function TeamCombobox({ selectedTeam, onSelect }) {
  const [open, setOpen] = React.useState(false);

  const teams = Object.entries(nbaEnToHe).map(([en, he]) => ({
    value: en,
    label: he,
  }));

  const selectedLabel = selectedTeam ? nbaEnToHe[selectedTeam] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-44 justify-between font-medium text-sm"
          dir="rtl"
        >
          <span className="truncate">{selectedLabel ?? "כל הקבוצות"}</span>
          <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" dir="rtl" align="end">
        <Command dir="rtl">
          <CommandInput placeholder="חפש קבוצה..." className="text-right" />
          <CommandList>
            <CommandEmpty>לא נמצאה קבוצה</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => { onSelect(null); setOpen(false); }}
                className="justify-between"
              >
                כל הקבוצות
                {!selectedTeam && <Check className="ml-2 h-4 w-4" />}
              </CommandItem>
              {teams.map((team) => (
                <CommandItem
                  key={team.value}
                  value={team.label}
                  onSelect={() => {
                    onSelect(team.value === selectedTeam ? null : team.value);
                    setOpen(false);
                  }}
                  className="justify-between"
                >
                  {team.label}
                  {selectedTeam === team.value && <Check className="ml-2 h-4 w-4 text-blue-600" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GameRecaps />
    </Suspense>
  );
}

function GameRecaps() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    selectedDate,
    games,
    selectedGame,
    isLoading,
    selectedTeam,
    teamFilterActive,
    featuredGames,
    otherGames,
    handlePreviousDay,
    handleNextDay,
    handleTeamFilter,
    handleGameSelect,
    handleBackToGames,
  } = useGameData();

  // Auto-open game from URL param on load
  useEffect(() => {
    const gameId = searchParams.get("game");
    if (gameId && games.length > 0 && !selectedGame) {
      const match = games.find(
        (g) => (g.espn_game_id || g._id?.toString()) === gameId
      );
      if (match) handleGameSelect(match);
    }
  }, [games, searchParams]);

  // Opens a game and sets the URL param
  const handleGameOpen = (game) => {
    handleGameSelect(game);
    const id = game.espn_game_id || game._id?.toString();
    const params = new URLSearchParams(searchParams.toString());
    params.set("game", id);
    router.replace(`/?${params.toString()}`);
  };

  // Clears game from URL on modal close
  const handleModalClose = () => {
    handleBackToGames();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("game");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/");
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden" dir="rtl">
      {/* Game Recap Modal */}
      <Dialog open={selectedGame !== null} onOpenChange={(open) => !open && handleModalClose()}>
        <DialogContent>
          {selectedGame && (
            <GameRecapView
              game={selectedGame}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Decorative background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
      </div>

      {/* Hero Section */}
      <Hero
        selectedDate={!teamFilterActive ? selectedDate : null}
        gameCount={!isLoading ? games.length : null}
        isLoading={isLoading}
      />

      {/* Enhanced Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Enhanced Logo/Brand */}
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05, rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-red-600 rounded-xl flex items-center justify-center shadow-lg"
              >
                <Dribbble className="w-7 h-7 text-white" strokeWidth={2.5} />
              </motion.div>
              <div>
                <h1 className="text-xl md:text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  סיכומי NBA בעברית
                </h1>
                <p className="text-xs text-gray-600 hidden md:block font-medium">
                  ניתוח מקצועי ומעמיק
                </p>
              </div>
            </div>

            {/* Team Filter */}
            <div className="flex items-center gap-3">
              {teamFilterActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTeamFilter(null)}
                  className="text-sm font-medium gap-1"
                >
                  <X className="w-3 h-3" />
                  נקה סינון
                </Button>
              )}
              <TeamCombobox selectedTeam={selectedTeam} onSelect={handleTeamFilter} />
            </div>
          </div>
        </div>
      </header>

      {/* Date Navigation */}
      {!teamFilterActive && (
        <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border-b border-purple-100">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <motion.div
              className="flex items-center justify-center gap-4"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.button
                onClick={handlePreviousDay}
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg hover:bg-white hover:shadow-md transition-all font-medium"
              >
                <ChevronRight className="w-4 h-4" />
                <span>יום קודם</span>
              </motion.button>

              <div className="flex items-center gap-3 px-6 py-3 bg-white/90 backdrop-blur-sm border-2 border-blue-600 rounded-xl shadow-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="font-bold text-lg text-gray-900">
                  {format(selectedDate, "dd/MM/yyyy")}
                </span>
              </div>

              <motion.button
                onClick={handleNextDay}
                whileHover={{ scale: 1.05, x: 2 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-lg hover:bg-white hover:shadow-md transition-all font-medium"
              >
                <span>יום הבא</span>
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
            </motion.div>
          </div>
        </div>
      )}

      {/* Team Filter Header */}
      {teamFilterActive && selectedTeam && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <h2 className="text-2xl font-bold text-center">
              משחקים אחרונים: {nbaEnToHe[selectedTeam]}
            </h2>
            <p className="text-center text-blue-100 mt-1">5 משחקים אחרונים</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div dir="rtl">
            {/* Featured section skeleton */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1 h-8 bg-gray-200 rounded-full"></div>
                <div className="w-40 h-8 bg-gray-200 rounded animate-shimmer"></div>
              </div>
              <GamesListSkeleton count={3} featured={true} />
            </div>
            {/* Other games section skeleton */}
            <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 bg-gray-300 rounded-full"></div>
                <div className="w-28 h-6 bg-gray-200 rounded animate-shimmer"></div>
              </div>
              <GamesListSkeleton count={3} featured={false} />
            </div>
          </div>
        ) : (
          <>
            {!teamFilterActive && games.length > 0 && (
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  משחקים עבור {format(selectedDate, "d MMMM yyyy", { locale: he })}
                </h2>
                <p className="text-gray-600">
                  {games.length} {games.length !== 1 ? "משחקים" : "משחק"} זמינים
                </p>
              </div>
            )}

            {!teamFilterActive && featuredGames.length > 0 && (
              <motion.div
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-gradient-to-b from-blue-600 to-purple-600 rounded-full"></div>
                    <h2 className="text-3xl font-black text-blue-700">
                      משחקים מובילים
                    </h2>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <TrendingUp className="w-6 h-6 text-purple-600" />
                    </motion.div>
                  </div>
                  <div className="h-1 flex-1 bg-gradient-to-l from-transparent via-purple-200 to-transparent mr-4 rounded-full"></div>
                </div>
                <GamesList
                  games={featuredGames}
                  selectedDate={selectedDate}
                  onGameSelect={handleGameOpen}
                  isLoading={false}
                  featured={true}
                  hideHeader={true}
                />
              </motion.div>
            )}

            {!teamFilterActive && featuredGames.length > 0 && otherGames.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 py-4 mb-8">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent rounded-full"></div>
                  <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-200 to-transparent rounded-full"></div>
                </div>
              </div>
            )}

            {!teamFilterActive && otherGames.length > 0 && (
              <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-gray-400 rounded-full"></div>
                    <h2 className="text-xl font-bold text-gray-800">
                      שאר המשחקים
                    </h2>
                    <span className="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-full font-medium">
                      {otherGames.length}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gray-200 mr-4"></div>
                </div>
                <GamesList
                  games={otherGames}
                  selectedDate={selectedDate}
                  onGameSelect={handleGameOpen}
                  isLoading={false}
                  hideHeader={true}
                />
              </div>
            )}

            {teamFilterActive && (
              <GamesList
                games={games}
                selectedDate={selectedDate}
                onGameSelect={handleGameOpen}
                isLoading={false}
                showDateHeaders={true}
              />
            )}

            {!isLoading && games.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
                dir="rtl"
              >
                {/* Animated basketball illustration */}
                <div className="w-24 h-24 mx-auto mb-6 relative">
                  <motion.div
                    className="w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center shadow-lg"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Circle className="w-12 h-12 text-orange-500" strokeWidth={3} />
                  </motion.div>
                  {/* Shadow that grows/shrinks with bounce */}
                  <motion.div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-gray-300/50 rounded-full blur-sm"
                    animate={{ scale: [1, 0.8, 1], opacity: [0.5, 0.3, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>

                <h3 className="text-2xl font-bold text-gray-800 mb-3">
                  אין משחקים זמינים
                </h3>
                <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
                  {teamFilterActive
                    ? "לא נמצאו משחקים לקבוצה זו. נסה לבחור קבוצה אחרת או חזור לתצוגה לפי תאריך."
                    : `לא נמצאו סיכומי משחקים ל-${format(selectedDate, "d MMMM yyyy", { locale: he })}. נסה לבחור תאריך אחר.`}
                </p>

                {/* Action buttons */}
                <div className="flex gap-3 justify-center flex-wrap">
                  {teamFilterActive ? (
                    <button
                      onClick={() => handleTeamFilter(null)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                    >
                      הצג את כל המשחקים
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handlePreviousDay}
                        className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                        יום קודם
                      </button>
                      <button
                        onClick={handleNextDay}
                        className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                      >
                        יום הבא
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
