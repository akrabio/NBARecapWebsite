"use client";

import { motion } from "framer-motion";
import { Calendar, Dribbble } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function Hero({ selectedDate, gameCount, isLoading }) {
  const formattedDate = selectedDate
    ? format(selectedDate, "d MMMM yyyy", { locale: he })
    : null;

  return (
    <motion.section
      className="relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      dir="rtl"
      style={{
        backgroundImage: "url('/hero_background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        minHeight: "88px",
      }}
    >
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 flex items-center justify-between py-4 gap-4 flex-wrap">

        {/* Brand mark */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <Dribbble className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-black text-base tracking-wide drop-shadow">
            סיכומי NBA בעברית
          </span>
        </div>

        {/* Date + Game Count */}
        <div className="flex items-center gap-3 flex-wrap">
          {formattedDate && (
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/20">
              <Calendar className="w-4 h-4 text-white/80" />
              <span className="text-white text-sm font-semibold">
                {formattedDate}
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="h-7 w-24 bg-white/20 rounded-full animate-shimmer" />
          ) : gameCount != null ? (
            <div
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 border text-sm font-semibold ${
                gameCount > 0
                  ? "bg-emerald-500/80 border-emerald-400/50 text-white"
                  : "bg-white/15 border-white/20 text-white/70"
              }`}
            >
              <span>
                {gameCount > 0
                  ? `${gameCount} ${gameCount === 1 ? "משחק" : "משחקים"}`
                  : "אין משחקים"}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
