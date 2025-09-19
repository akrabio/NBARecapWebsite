import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function GameCard({ game, onClick }) {
  const winnerScore = Math.max(game.home_score || 0, game.away_score || 0);
  const homeWon = game.home_score >= game.away_score;
  const awayWon = game.away_score >= game.home_score;

  return (
    <motion.div
      whileHover={{ y: -4, shadow: "0 10px 25px rgba(0,0,0,0.1)" }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className="cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-white to-gray-50"
        onClick={() => onClick(game)}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Badge
              variant={game.game_status === "final" ? "default" : "secondary"}
              className={`${
                game.game_status === "final"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {game.game_status === "final" ? (
                <>
                  <Trophy className="w-3 h-3 mr-1" />
                  Final
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 mr-1" />
                  {game.game_status}
                </>
              )}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Away Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-lg font-bold text-gray-800">
                  {game.away_team}
                </div>
                {awayWon && game.game_status === "final" && (
                  <Trophy className="w-4 h-4 text-yellow-500" />
                )}
              </div>
              <div
                className={`text-xl font-bold ${
                  awayWon ? "text-green-600" : "text-gray-600"
                }`}
              >
                {game.away_score || 0}
              </div>
            </div>

            {/* Divider */}
            <div className="border-b border-gray-200"></div>

            {/* Home Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-lg font-bold text-gray-800">
                  {game.home_team}
                </div>
                {homeWon && game.game_status === "final" && (
                  <Trophy className="w-4 h-4 text-yellow-500" />
                )}
              </div>
              <div
                className={`text-xl font-bold ${
                  homeWon ? "text-green-600" : "text-gray-600"
                }`}
              >
                {game.home_score || 0}
              </div>
            </div>
          </div>

          {/* <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 line-clamp-2">
              {game.title}
            </h3>
          </div> */}
        </CardContent>
      </Card>
    </motion.div>
  );
}
