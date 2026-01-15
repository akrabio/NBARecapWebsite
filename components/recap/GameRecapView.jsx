"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TeamColorProvider } from "./TeamColorProvider";
import RecapHeader from "./RecapHeader";
import RecapSummary from "./RecapSummary";
import BoxScore from "./BoxScore";
import HighlightsTab from "./HighlightsTab";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DialogClose, DialogTitle, VisuallyHidden } from "@/components/ui/dialog";

function TabButton({ isActive, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 relative py-4 px-4 text-base md:text-lg font-bold transition-colors min-h-[56px]
        ${isActive
          ? "text-blue-600"
          : "text-gray-500 hover:text-gray-700 active:bg-gray-100"
        }`}
    >
      <span className="relative z-10">{label}</span>
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

export default function GameRecapView({ game }) {
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
            <div className="flex" dir="rtl">
              <TabButton
                isActive={activeTab === "recap"}
                onClick={() => setActiveTab("recap")}
                label="סיכום המשחק"
              />
              <TabButton
                isActive={activeTab === "boxscore"}
                onClick={() => setActiveTab("boxscore")}
                label="נתוני משחק"
              />
              <TabButton
                isActive={activeTab === "highlights"}
                onClick={() => setActiveTab("highlights")}
                label="תקציר"
              />
            </div>
          </div>
        </div>

        {/* Content with Smooth Transitions */}
        <ErrorBoundary fallbackMessage="אירעה שגיאה בטעינת תוכן המשחק. נסה לרענן את הדף.">
          <div style={{ position: 'relative' }}>
            {activeTab === "recap" && (
              <motion.div
                key="recap"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: 'auto' }}
              >
                <RecapSummary
                  content={game.content}
                  homeTeam={game.home_team}
                  awayTeam={game.away_team}
                  gameId={game.espn_game_id || game.game_id}
                />
              </motion.div>
            )}

            {activeTab === "boxscore" && (
              <motion.div
                key="boxscore"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: 'auto' }}
              >
                <BoxScore gameId={game.espn_game_id || game.game_id} />
              </motion.div>
            )}

            {activeTab === "highlights" && (
              <motion.div
                key="highlights"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: 'auto' }}
              >
                <HighlightsTab game={game} />
              </motion.div>
            )}
          </div>
        </ErrorBoundary>
      </div>
    </TeamColorProvider>
  );
}
