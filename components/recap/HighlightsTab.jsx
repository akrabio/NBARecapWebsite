"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Video, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function HighlightsTab({ game }) {
  const [isLoading, setIsLoading] = useState(true);
  const [videoId, setVideoId] = useState(null);
  const [error, setError] = useState(false);

  // Format the search query for YouTube
  const getSearchQuery = () => {
    const awayTeam = game.away_team || "";
    const homeTeam = game.home_team || "";
    const date = game.date ? format(new Date(game.date), "MMM dd yyyy") : "";
    return `${awayTeam} vs ${homeTeam} highlights ${date}`;
  };

  const getYouTubeSearchUrl = () => {
    // Search within TheGametimeHighlights channel
    const query = getSearchQuery();
    return `https://www.youtube.com/@TheGametimeHighlights/search?query=${encodeURIComponent(query)}`;
  };

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        setIsLoading(true);
        setError(false);

        const query = getSearchQuery();
        const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);

        if (!response.ok) {
          throw new Error('Failed to fetch video');
        }

        const data = await response.json();

        if (data.videoId) {
          setVideoId(data.videoId);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching YouTube video:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVideo();
  }, [game]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20" dir="rtl">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
        <p className="text-lg font-medium text-gray-600">טוען תקציר...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-4 py-8"
      dir="rtl"
    >
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-blue-600 p-6">
          <div className="flex items-center justify-center gap-3 text-white">
            <Video className="w-8 h-8" />
            <h2 className="text-2xl font-bold">תקציר וידאו</h2>
          </div>
          <p className="text-center text-white/90 mt-2">
            {game.away_team} נגד {game.home_team}
          </p>
        </div>

        {/* Video Player Area */}
        <div className="p-6">
          {error ? (
            /* Error State */
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-6 flex items-center justify-center">
              <div className="text-center p-6">
                <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  לא נמצא תקציר וידאו
                </h3>
                <p className="text-gray-500 mb-4">
                  לא הצלחנו למצוא תקציר וידאו למשחק זה
                </p>
                <a
                  href={getYouTubeSearchUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  <Video className="w-5 h-5" />
                  <span>חפש ביוטיוב</span>
                </a>
              </div>
            </div>
          ) : (
            /* Video Embed */
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-6">
              <iframe
                className="w-full h-full border-0"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="NBA Game Highlights"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* External Link Button */}
          <a
            href={getYouTubeSearchUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            <Video className="w-5 h-5" />
            <span>פתח ביוטיוב</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Alternative Sources */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500 mb-3">לא מצאת את מה שחיפשת?</p>
        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href="https://www.youtube.com/@TheGametimeHighlights/videos"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-red-600 transition-colors"
          >
            <Video className="w-4 h-4" />
            <span>ערוץ TheGametime Highlights</span>
          </a>
          <span className="text-gray-300">|</span>
          <a
            href={`https://www.nba.com/games`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>NBA.com</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
}
