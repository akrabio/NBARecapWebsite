import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import GameCard from "./GameCard";
import { Calendar, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function GamesList({
  games,
  selectedDate,
  onGameSelect,
  isLoading,
  featured = false,
  showDateHeaders = false,
  hideHeader = false,
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20" dir="rtl">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
        <p className="text-lg font-medium text-gray-600">טוען משחקים...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
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
          {showDateHeaders ? "לא נמצאו משחקים לקבוצה זו" : `לא נמצאו סיכומי משחקים עבור ${format(selectedDate, "d MMMM yyyy", { locale: he })}`}
        </p>
        <div className="flex items-center justify-center text-sm text-gray-400">
          <span>{showDateHeaders ? "נסה קבוצה אחרת" : "נסה לבחור תאריך אחר"}</span>
          <Calendar className="w-4 h-4 mr-2" />
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {!showDateHeaders && !hideHeader && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            משחקים עבור {format(selectedDate, "d MMMM yyyy", { locale: he })}
          </h2>
          <p className="text-gray-600">
            {games.length} {games.length !== 1 ? "משחקים" : "משחק"} זמינים
          </p>
        </div>
      )}

      <AnimatePresence>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.08
              }
            }
          }}
          initial="hidden"
          animate="show"
        >
          {games.map((game, index) => (
            <motion.div
              key={game._id?.toString() || index}
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.95 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.4, ease: "easeOut" }
                }
              }}
            >
              <GameCard
                game={game}
                onClick={onGameSelect}
                featured={featured}
                showDate={showDateHeaders}
              />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}