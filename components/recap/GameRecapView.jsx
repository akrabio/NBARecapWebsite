"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TeamColorProvider } from "./TeamColorProvider";
import RecapHeader from "./RecapHeader";
import RecapSummary from "./RecapSummary";
import BoxScore from "./BoxScore";
import { DialogClose, DialogTitle, VisuallyHidden } from "@/components/ui/dialog";

export default function GameRecapView({ game, onBack }) {
  const [activeTab, setActiveTab] = useState("recap");

  return (
    <TeamColorProvider homeTeam={game.home_team} awayTeam={game.away_team}>
      <div className="min-h-screen bg-gray-50">
        {/* Visually Hidden Title for Accessibility */}
        <VisuallyHidden>
          <DialogTitle>
            סיכום משחק: {game.away_team} נגד {game.home_team}
          </DialogTitle>
        </VisuallyHidden>

        {/* Close Button */}
        <DialogClose />

        {/* Header with Team Colors and Animated Scores */}
        <RecapHeader game={game} />

        {/* Tab Navigation - Sticky */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1" dir="rtl">
              <button
                onClick={() => setActiveTab("recap")}
                className={`flex-1 py-4 px-6 text-lg font-bold transition-all ${
                  activeTab === "recap"
                    ? "text-blue-600 border-b-4 border-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                סיכום המשחק
              </button>
              <button
                onClick={() => setActiveTab("boxscore")}
                className={`flex-1 py-4 px-6 text-lg font-bold transition-all ${
                  activeTab === "boxscore"
                    ? "text-blue-600 border-b-4 border-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                נתוני משחק
              </button>
            </div>
          </div>
        </div>

        {/* Content with Smooth Transitions */}
        <AnimatePresence mode="wait">
          {activeTab === "recap" && (
            <motion.div
              key="recap"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ pointerEvents: 'auto' }}
            >
              <RecapSummary
                content={game.content}
                homeTeam={game.home_team}
                awayTeam={game.away_team}
              />
            </motion.div>
          )}

          {activeTab === "boxscore" && (
            <motion.div
              key="boxscore"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ pointerEvents: 'auto' }}
            >
              <BoxScore gameId={game.espn_game_id || game.game_id} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TeamColorProvider>
  );
}
