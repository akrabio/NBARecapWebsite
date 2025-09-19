import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Trophy } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import remarkGfm from "remark-gfm";

export default function GameRecapView({ game, onBack }) {
  const homeWon = game.home_score >= game.away_score;
  const finalScore = `${game.away_team} ${game.away_score} - ${game.home_score} ${game.home_team}`;


    const parseGameTitle = (title) => {
    const regex = /^(.+?)\s*\((\d+-\d+)\)\s*(\d+)\s*[-–]\s*(\d+)\s*(.+?)\s*\((\d+-\d+)\)$/;
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
      className="w-full px-4 md:px-8 lg:px-12"
    >
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="outline"
          onClick={onBack}
          className="mb-6 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Games
        </Button>

        {/* Responsive Header + Image Layout */}
        <div className="bg-gradient-to-r from-red-600 to-blue-600 text-white rounded-xl overflow-hidden mb-8">
          <div className="flex flex-col lg:flex-row">
             {/* Image - Desktop: Right side, Mobile: Below */}
            {game.image_url && (
              <div className="lg:w-1/2 lg:max-w-md lg:min-h-[200px]">
                <img
                  src={game.image_url}
                  alt={game.title}
                  className="w-full h-auto min-h-[120px] max-h-60 lg:h-full lg:max-h-none lg:min-h-[200px] object-cover"
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
                  <Clock className="w-3 h-3 mr-1" />
                  {format(new Date(game.date), "MMMM d, yyyy")}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white border-white/30"
                >
                  <Trophy className="w-3 h-3 mr-1" />
                  Final
                </Badge>
              </div>

              {/* Game Title Breakdown */}
              {gameInfo.originalTitle ? (
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4">
                  {gameInfo.originalTitle}
                </h1>
              ) : (
                <div className="space-y-4" dir="rtl">
                  {/* Teams and Records */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Team 1 */}
                    <div className="text-center md:text-right">
                      <div className="text-xl md:text-2xl lg:text-3xl font-bold mb-1">
                        {gameInfo.team1}
                      </div>
                      <div className="text-sm md:text-base opacity-80 bg-white/20 rounded-full px-3 py-1 inline-block">
                        {gameInfo.record1}
                      </div>
                    </div>
                    
                    {/* Score */}
                    <div className="text-center order-first md:order-none">
                      <div className="text-1xl md:text-2xl lg:text-3xl font-bold">
                        {gameInfo.score1} - {gameInfo.score2}
                      </div>
                    </div>
                    
                    {/* Team 2 */}
                    <div className="text-center md:text-left">
                      <div className="text-xl md:text-2xl lg:text-3xl font-bold mb-1">
                        {gameInfo.team2}
                      </div>
                      <div className="text-sm md:text-base opacity-80 bg-white/20 rounded-full px-3 py-1 inline-block">
                        {gameInfo.record2}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* <div className="text-xl font-semibold opacity-90">
                {finalScore}
              </div> */}
            </div>
            
          </div>
        </div>
      </div>

      {/* Recap Content */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="prose prose-lg max-w-none" dir="rtl">
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
                <div className="overflow-x-auto my-6">
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
                <td className="px-4 py-3 text-sm text-gray-800 text-center font-medium border-r border-gray-200 last:border-r-0">
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
