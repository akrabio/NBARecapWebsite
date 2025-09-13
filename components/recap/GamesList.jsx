import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import GameCard from "./GameCard";
import { Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function GamesList({
  games,
  selectedDate,
  onGameSelect,
  isLoading,
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array(6)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 rounded-xl h-48"></div>
            </div>
          ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-16"
      >
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">
          No Games Available
        </h3>
        <p className="text-gray-500 mb-6">
          No game recaps found for {format(selectedDate, "MMMM d, yyyy")}
        </p>
        <div className="flex items-center justify-center text-sm text-gray-400">
          <Calendar className="w-4 h-4 mr-2" />
          Try selecting a different date
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Games for {format(selectedDate, "MMMM d, yyyy")}
        </h2>
        <p className="text-gray-600">
          {games.length} game{games.length !== 1 ? "s" : ""} available
        </p>
      </div>

      <AnimatePresence>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.1 }}
        >
          {games.map((game, index) => (
            <motion.div
              key={game._id?.toString() || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <GameCard game={game} onClick={onGameSelect} />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
