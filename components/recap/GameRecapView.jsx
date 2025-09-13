import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, MapPin, Trophy } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

export default function GameRecapView({ game, onBack }) {
  const homeWon = game.home_score >= game.away_score;
  const finalScore = `${game.away_team} ${game.away_score} - ${game.home_score} ${game.home_team}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
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

        <div className="bg-gradient-to-r from-red-600 to-blue-600 text-white rounded-xl p-6 mb-8">
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

          <h1 className="text-3xl md:text-4xl font-bold mb-4">{game.title}</h1>

          <div className="text-xl font-semibold opacity-90">{finalScore}</div>
        </div>
      </div>

      {/* Game Image */}
      {game.image_url && (
        <div className="mb-8">
          <img
            src={game.image_url}
            alt={game.title}
            className="w-full h-64 md:h-96 object-cover rounded-xl shadow-lg"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      )}

      {/* Recap Content */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown
            // className="text-gray-700 leading-relaxed"
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-gray-800 mb-4 mt-8">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-gray-800 mb-3 mt-6">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-gray-800 mb-2 mt-4">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="mb-4 text-gray-700 leading-relaxed">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-gray-700">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-red-500 pl-4 italic bg-gray-50 py-2 my-4">
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
            }}
          >
            {game.content}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
