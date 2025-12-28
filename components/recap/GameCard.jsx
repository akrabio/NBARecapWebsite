import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, TrendingUp, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { nbaEnToHe } from "../../utils/consts"

export default function GameCard({ game, onClick, featured = false, showDate = false }) {
  const winnerScore = Math.max(game.home_score || 0, game.away_score || 0);
  const homeWon = game.home_score >= game.away_score;
  const awayWon = game.away_score > game.home_score;

  const homeTeam = nbaEnToHe[game.home_team]
  const awayTeam = nbaEnToHe[game.away_team]

  // Extract team records from title if available
  const extractRecord = (title, teamName) => {
    if (!title) return null;
    // Look for patterns like "Lakers (23-19)" or similar
    const regex = new RegExp(`${teamName}[^(]*\\((\\d+-\\d+)\\)`, 'i');
    const match = title.match(regex);
    return match ? match[1] : null;
  };

  const homeRecord = extractRecord(game.title, game.home_team);
  const awayRecord = extractRecord(game.title, game.away_team);

  // Helper function to get team logo URL (placeholder - replace with actual logo URLs)
  const getTeamLogo = (teamName) => {
    // Placeholder - you can replace this with actual logo URLs
    return `/logos/${teamName.toLowerCase().replace(/\s+/g, '-')}.png`;
  };

  const cardContent = (
    <motion.div
      whileHover={{
        y: -8,
        scale: 1.02,
        transition: { duration: 0.3, ease: "easeOut" }
      }}
      whileTap={{
        scale: 0.98,
        transition: { duration: 0.1 }
      }}
    >
      <Card
        className={`cursor-pointer transition-all duration-300 overflow-hidden ${
          featured
            ? 'border-0 shadow-2xl hover:shadow-3xl bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'
            : 'border border-gray-200 shadow-md hover:shadow-lg bg-white hover:border-blue-300'
        }`}
        onClick={() => onClick(game)}
        dir="rtl"
      >
        <CardContent className={`${featured ? 'p-6' : 'p-5'}`}>
          {/* Date Badge - shown when filtering by team */}
          {showDate && game.date && (
            <div className="mb-3 flex justify-center">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-semibold">
                <Calendar className="w-3 h-3 ml-1" />
                {format(new Date(game.date), "d MMMM yyyy", { locale: he })}
              </Badge>
            </div>
          )}

          {/* Header: Status Badge */}
          <div className="flex items-center justify-between mb-4">
            <Badge
              variant={game.game_status === "final" ? "default" : "secondary"}
              className={`text-xs font-bold ${
                game.game_status === "final"
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                  : "bg-amber-100 text-amber-700 border border-amber-300"
              }`}
            >
              {game.game_status === "final" ? (
                <div className="flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  <span>סיום</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>בהמשך</span>
                </div>
              )}
            </Badge>

            {featured && (
              <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold">
                <TrendingUp className="w-3 h-3 mr-1" />
                משחק מומלץ
              </Badge>
            )}
          </div>

          {/* Teams and Scores */}
          <div className="space-y-3">
            {/* Away Team */}
            <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              awayWon ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'bg-gray-50'
            }`}>
              <div className="flex items-center gap-3 flex-1">
                <img
                  src={getTeamLogo(game.away_team)}
                  alt={`${awayTeam} logo`}
                  className={`${featured ? 'w-10 h-10' : 'w-8 h-8'} object-contain`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = `${featured ? 'w-10 h-10' : 'w-8 h-8'} bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm`;
                    placeholder.textContent = (awayTeam || 'TM').substring(0, 2).toUpperCase();
                    e.target.parentNode.insertBefore(placeholder, e.target);
                  }}
                />
                <div className="flex flex-col">
                  <div className={`${featured ? 'text-lg' : 'text-base'} font-bold text-gray-900`}>
                    {awayTeam}
                  </div>
                  {awayRecord && (
                    <div className="text-xs text-gray-500 font-medium">
                      {awayRecord}
                    </div>
                  )}
                </div>
              </div>
              <div className={`${featured ? 'text-3xl' : 'text-2xl'} font-black ${
                awayWon ? "text-emerald-600" : "text-gray-400"
              }`}>
                {game.away_score || 0}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center">
              <div className="h-px flex-1 bg-gray-300"></div>
              <span className="px-2 text-xs text-gray-400 font-medium">VS</span>
              <div className="h-px flex-1 bg-gray-300"></div>
            </div>

            {/* Home Team */}
            <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              homeWon ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'bg-gray-50'
            }`}>
              <div className="flex items-center gap-3 flex-1">
                <img
                  src={getTeamLogo(game.home_team)}
                  alt={`${homeTeam} logo`}
                  className={`${featured ? 'w-10 h-10' : 'w-8 h-8'} object-contain`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = `${featured ? 'w-10 h-10' : 'w-8 h-8'} bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm`;
                    placeholder.textContent = (homeTeam || 'TM').substring(0, 2).toUpperCase();
                    e.target.parentNode.insertBefore(placeholder, e.target);
                  }}
                />
                <div className="flex flex-col">
                  <div className={`${featured ? 'text-lg' : 'text-base'} font-bold text-gray-900`}>
                    {homeTeam}
                  </div>
                  {homeRecord && (
                    <div className="text-xs text-gray-500 font-medium">
                      {homeRecord}
                    </div>
                  )}
                </div>
              </div>
              <div className={`${featured ? 'text-3xl' : 'text-2xl'} font-black ${
                homeWon ? "text-emerald-600" : "text-gray-400"
              }`}>
                {game.home_score || 0}
              </div>
            </div>
          </div>

          {/* Footer: Click prompt for featured games */}
          {featured && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs text-center text-gray-500 font-medium">
                לחץ לצפייה בסיכום המלא
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  if (featured) {
    return (
      <div className="relative p-[2px] rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient-rotate animate-glow-pulse">
        <div className="relative bg-white rounded-xl">
          {cardContent}
        </div>
      </div>
    );
  }

  return cardContent;
}