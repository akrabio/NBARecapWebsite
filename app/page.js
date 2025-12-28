"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format, subDays, addDays, isToday } from "date-fns";
import { he } from "date-fns/locale";
import { motion } from "framer-motion";
import GamesList from "../components/recap/GamesList";
import GameRecapView from "../components/recap/GameRecapView";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dribbble, ChevronLeft, ChevronRight, Calendar, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { getRecordsByDate, getRecordsByTeam } from "@/utils/api";
import { nbaEnToHe } from "@/utils/consts";
import { getFeaturedGames as getFeaturedGamesUtil } from "@/utils/gameScoring";

export default function GameRecaps() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamFilterActive, setTeamFilterActive] = useState(false);
  

  const loadGamesForDate = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateString = format(selectedDate, "yyyy-MM-dd");
      const gamesForDate = await getRecordsByDate(dateString);
      setGames(gamesForDate);
    } catch (error) {
      console.error("Error loading games:", error);
      setGames([]);
    }
    setIsLoading(false);
  }, [selectedDate]);

  const loadGamesForTeam = useCallback(async (teamName) => {
    setIsLoading(true);
    try {
      const teamGames = await getRecordsByTeam(teamName, 5);
      setGames(teamGames);
    } catch (error) {
      console.error("Error loading team games:", error);
      setGames([]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (teamFilterActive && selectedTeam) {
      loadGamesForTeam(selectedTeam);
    } else {
      loadGamesForDate();
    }
  }, [loadGamesForDate, loadGamesForTeam, teamFilterActive, selectedTeam]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  };

  const handlePreviousDay = () => {
    setSelectedDate((prev) => subDays(prev, 1));
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => addDays(prev, 1));
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  };

  const handleToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Yesterday is "today" for game recaps
    setSelectedDate(d);
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  };

  const handleTeamFilter = (team) => {
    if (team) {
      setSelectedTeam(team);
      setTeamFilterActive(true);
      setSelectedGame(null);
    } else {
      setTeamFilterActive(false);
      setSelectedTeam(null);
    }
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
  };

  const featuredGames = getFeaturedGamesUtil(games, 3);
  const otherGames = games.filter(
    (g) => !featuredGames.find((fg) => fg._id === g._id)
  );

  return (
    <div className="min-h-screen bg-white relative overflow-hidden" dir="rtl">
      {/* Game Recap Modal */}
      <Dialog open={selectedGame !== null} onOpenChange={(open) => !open && setSelectedGame(null)}>
        <DialogContent>
          {selectedGame && (
            <GameRecapView
              game={selectedGame}
              onBack={handleBackToGames}
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
      <Hero />

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
                <Dribbble className="w-7 h-7 text-white" />
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
                <button
                  onClick={() => handleTeamFilter(null)}
                  className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  נקה סינון
                </button>
              )}
              <select
                value={selectedTeam || ""}
                onChange={(e) => handleTeamFilter(e.target.value || null)}
                className="text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">כל הקבוצות</option>
                {Object.keys(nbaEnToHe).map((team) => (
                  <option key={team} value={team}>
                    {nbaEnToHe[team]}
                  </option>
                ))}
              </select>
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
          <div className="flex flex-col items-center justify-center py-20" dir="rtl">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
            <p className="text-lg font-medium text-gray-600">טוען משחקים...</p>
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
                    <h2 className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
                  onGameSelect={handleGameSelect}
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
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    שאר המשחקים
                  </h2>
                  <div className="h-1 flex-1 bg-gradient-to-l from-transparent to-gray-200 mr-4"></div>
                </div>
                <GamesList
                  games={otherGames}
                  selectedDate={selectedDate}
                  onGameSelect={handleGameSelect}
                  isLoading={false}
                  hideHeader={true}
                />
              </div>
            )}

            {teamFilterActive && (
              <GamesList
                games={games}
                selectedDate={selectedDate}
                onGameSelect={handleGameSelect}
                isLoading={false}
                showDateHeaders={true}
              />
            )}

            {!isLoading && games.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16"
                dir="rtl"
              >
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  אין משחקים זמינים
                </h3>
                <p className="text-gray-500 mb-6">
                  {teamFilterActive ? "לא נמצאו משחקים לקבוצה זו" : `לא נמצאו סיכומי משחקים עבור ${format(selectedDate, "d MMMM yyyy", { locale: he })}`}
                </p>
                <div className="flex items-center justify-center text-sm text-gray-400">
                  <span>{teamFilterActive ? "נסה קבוצה אחרת" : "נסה לבחור תאריך אחר"}</span>
                  <Calendar className="w-4 h-4 mr-2" />
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