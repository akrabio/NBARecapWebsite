import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Trophy } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import remarkGfm from "remark-gfm";
import { nbaEnToHe } from "@/utils/consts";

export default function GameRecapView({ game, onBack }) {


    const getTeamLogo = (teamName) => {
    // Placeholder - you can replace this with actual logo URLs
    return `/logos/${teamName.toLowerCase().replace(/\s+/g, '-')}.png`;
    };


    const parseGameTitle = (title) => {
const regex = /^\*{0,2}\s*(?<team1>.+?)\s*\((?<record1>\d+[:-]\d+)\)\s*(?<score1>\d+)\s*[-–—]\s*(?<score2>\d+)\s*(?<team2>.+?)\s*\((?<record2>\d+[:-]\d+)\)\s*\*{0,2}$/;
    const match = title.match(regex);
    
    if (match) {
      const [, team1, record1, score1, score2, team2, record2] = match;
      return {
        team1: team1.trim(),
        record1: record1.trim(),
        score1: score1.trim(),
        score2: score2.trim(),
        team2: team2.trim(),
        record2: record2.trim()
      };
    }
    
    // Fallback - return original title
    return { originalTitle: title };
  };
  const gameInfo = parseGameTitle(game.title);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full px-1 md:px-8 lg:px-12"
      dir="rtl"
    >
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={onBack}
          className="mb-6 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
        >
          <span>חזרה למשחקים</span>
          <ArrowLeft className="w-4 h-4 ml-2" />
        </Button>


        {/* Responsive Header + Image Layout */}
        <div className="bg-gradient-to-r from-red-600 to-blue-600 text-white rounded-xl overflow-hidden mb-8">
          <div className="flex flex-col lg:flex-row-reverse">
             {/* Image - Desktop: Left side, Mobile: Below */}
            {game.image_url && (
              <div className="lg:w-1/2 lg:max-w-md">
                <img
                  src={game.image_url}
                  alt={game.title}
                  className="w-full h-auto max-h-60 lg:max-h-80 object-cover"
                  onError={(e) => {
                    e.target.parentNode.style.display = "none";
                  }}
                />
              </div>
            )}
            {/* Header Content */}
            <div className="flex-1 p-6">
              <div className="flex items-center justify-between mb-4">
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white border-white/30"
                >
                  <span>סיום</span>
                  <Trophy className="w-3 h-3 ml-1" />
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white border-white/30"
                >
                  <span>{format(new Date(game.date), "d MMMM yyyy", { locale: he })}</span>
                  <Clock className="w-3 h-3 ml-1" />
                </Badge>
              </div>

              {/* Game Title Breakdown */}
              {gameInfo.originalTitle ? (
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 text-right">
                  {gameInfo.originalTitle}
                </h1>
              ) : (
                <div className="space-y-4">
                  {/* Teams and Records */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Team 1 */}
                    <div className="text-center">
                      <div className="flex flex-col items-center ">                       
                        <div className="text-xl md:text-2xl lg:text-3xl font-bold mb-1">
                          {nbaEnToHe[game.home_team]}
                        </div>
                        <div className="text-sm md:text-base opacity-80 bg-white/20 rounded-full px-3 py-1 inline-block">
                          {gameInfo.team1 == nbaEnToHe[game.home_team] ? gameInfo.record1 : gameInfo.record2}
                        </div>
                        <img
                        src={getTeamLogo(game.home_team)}
                        // alt={`${awayTeam} logo`}
                        className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain mb-2"
                        onError={(e) => {
                          // Fallback to placeholder when image fails to load
                          e.target.style.display = 'none';
                          const placeholder = document.createElement('div');
                          placeholder.className = 'w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500';
                          placeholder.textContent = game.home_team.substring(0, 2).toUpperCase();
                          e.target.parentNode.insertBefore(placeholder, e.target);
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Score */}
                    <div className="text-center order-first md:order-none">
                      <div className="text-1xl md:text-2xl lg:text-3xl font-bold">
                        {game.home_score} - {game.away_score}
                      </div>
                    </div>
                    
                    {/* Team 2 */}
                    <div className="text-center">
                      <div className="flex flex-col items-center"> 
                        <div className="text-xl md:text-2xl lg:text-3xl font-bold mb-1">
                          {nbaEnToHe[game.away_team]}
                        </div>
                        <div className="text-sm md:text-base opacity-80 bg-white/20 rounded-full px-3 py-1 inline-block">
                          {gameInfo.team2 == nbaEnToHe[game.away_team] ? gameInfo.record2 : gameInfo.record1}
                        </div>
                        <img
                          src={getTeamLogo(game.away_team)}
                            alt={`${game.home_team} logo`}
                            className="block loat-left clear-both w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain mb-2"
                            onError={(e) => {
                              // Fallback to placeholder when image fails to load
                              e.target.style.display = 'none';
                              const placeholder = document.createElement('div');
                              placeholder.className = 'w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500';
                              placeholder.textContent = game.away_team.substring(0, 2).toUpperCase();
                              e.target.parentNode.insertBefore(placeholder, e.target);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </div>
      </div>

      {/* Recap Content */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 lg:p-8">
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-gray-800 mb-4 mt-8 text-right">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-gray-800 mb-3 mt-6 text-right">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-gray-800 mb-2 mt-4 text-right">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="mb-4 text-gray-700 leading-relaxed text-right">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pr-6 mb-4 space-y-1 text-right" dir="rtl">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pr-6 mb-4 space-y-1 text-right" dir="rtl">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-gray-700 text-right">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-r-4 border-red-500 pr-4 italic bg-gray-50 py-2 my-4 text-right" dir="rtl">
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                  {children}
                </code>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-800">
                  {children}
                </strong>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-6" dir="rtl">
                  <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  {children}
                </thead>
              ),
              tbody: ({ children }) => (
                <tbody className="divide-y divide-gray-200">
                  {children}
                </tbody>
              ),
              tr: ({ children }) => (
                <tr className="hover:bg-gray-50 transition-colors duration-150">
                  {children}
                </tr>
              ),
              th: ({ children }) => (
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b-2 border-gray-300">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-3 text-sm text-gray-800 text-center font-medium border-l border-gray-200 last:border-l-0">
                  {children}
                </td>
              ),
            }}
          >
            {game.content}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}