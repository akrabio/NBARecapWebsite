"use client";

import React from "react";
import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useTeamColors } from "./TeamColorProvider";
import { nbaEnToHe } from "@/utils/consts";
import { Badge } from "@/components/ui/badge";

// Animated score counter hook with easing
function useAnimatedScore(finalScore, duration = 1000) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let startTime;
    let animationFrame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Ease out quart for smooth deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(finalScore * easeOutQuart));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [finalScore, duration]);

  return count;
}

function TeamSection({ team, score, record, isWinner, isHome }) {
  const animatedScore = useAnimatedScore(score);

  const getTeamLogo = (teamName) => {
    return `/logos/${teamName.toLowerCase().replace(/\s+/g, '-')}.png`;
  };

  return (
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: isHome ? 0.2 : 0.3, duration: 0.6 }}
    >
      {/* Team Logo */}
      <div className={`relative ${isWinner ? 'animate-glow-pulse' : ''}`}>
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white shadow-2xl flex items-center justify-center overflow-hidden">
          <img
            src={getTeamLogo(team)}
            alt={team}
            className="w-20 h-20 md:w-28 md:h-28 object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = `<div class="text-2xl md:text-3xl font-black text-gray-700">${team.split(' ').map(w => w[0]).join('')}</div>`;
            }}
          />
        </div>
        {isWinner && (
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white text-lg">
            👑
          </div>
        )}
      </div>

      {/* Team Name */}
      <div className="text-center">
        <h3 className="text-xl md:text-2xl font-black text-white drop-shadow-lg">
          {nbaEnToHe[team] || team}
        </h3>
        {record && (
          <p className="text-sm text-white/80 font-medium mt-1">
            {record}
          </p>
        )}
      </div>

      {/* Score */}
      <motion.div
        className={`text-5xl md:text-7xl font-black ${
          isWinner ? 'text-white' : 'text-white/60'
        } drop-shadow-2xl`}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
      >
        {animatedScore}
      </motion.div>
    </motion.div>
  );
}

export default function RecapHeader({ game }) {
  const { homeColors, awayColors, gameGradient } = useTeamColors();

  // Extract records from title
  const extractRecord = (title, teamName) => {
    const regex = new RegExp(`${teamName}\\s*\\((\\d+-\\d+)\\)`, 'i');
    const match = title?.match(regex);
    return match ? match[1] : null;
  };

  const homeRecord = extractRecord(game.title, game.home_team);
  const awayRecord = extractRecord(game.title, game.away_team);
  const isHomeWinner = game.home_score > game.away_score;

  return (
    <div className="relative">
      {/* Team Color Gradient Background */}
      <div
        className="absolute inset-0"
        style={{ background: gameGradient }}
      />

      {/* Glassmorphism overlay for readability */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-16" dir="rtl">
        {/* Team Sections */}
        <div className="grid grid-cols-3 gap-8 items-center mb-8">
          {/* Away Team */}
          <TeamSection
            team={game.away_team}
            score={game.away_score}
            record={awayRecord}
            isWinner={!isHomeWinner}
            isHome={false}
          />

          {/* VS Divider */}
          <div className="flex flex-col items-center">
            <motion.div
              className="text-2xl md:text-3xl font-black text-white/80"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              VS
            </motion.div>
            <div className="h-1 w-16 bg-white/40 rounded-full mt-2" />
          </div>

          {/* Home Team */}
          <TeamSection
            team={game.home_team}
            score={game.home_score}
            record={homeRecord}
            isWinner={isHomeWinner}
            isHome={true}
          />
        </div>

        {/* Game Info Bar */}
        <motion.div
          className="flex items-center justify-center gap-6 flex-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {game.date && (
            <div className="flex items-center gap-2 text-white/90">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">
                {format(new Date(game.date), "d MMMM yyyy", { locale: he })}
              </span>
            </div>
          )}

          <Badge className="bg-white/20 text-white border-white/30">
            {game.game_status === "final" ? "נגמר" : "בהמשך"}
          </Badge>
        </motion.div>
      </div>
    </div>
  );
}
