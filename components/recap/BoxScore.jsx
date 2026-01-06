import React, { useState, useEffect } from "react";
import { getBoxScore } from "@/utils/api";
import { Loader2 } from "lucide-react";
import { useTeamColors } from "./TeamColorProvider";

export default function BoxScore({ gameId }) {
  const [boxScore, setBoxScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { homeColors, awayColors, homeTeam, awayTeam } = useTeamColors();

  useEffect(() => {
    async function fetchBoxScore() {
      if (!gameId) {
        setError("אין מזהה משחק זמין");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await getBoxScore(gameId);
        setBoxScore(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching box score:", err);
        setError("לא ניתן לטעון את נתוני המשחק");
      } finally {
        setLoading(false);
      }
    }

    fetchBoxScore();
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="mr-3 text-gray-600">טוען נתונים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center" dir="rtl">
        <p className="text-red-700 font-medium">{error}</p>
        <p className="text-sm text-red-600 mt-2">
          ייתכן שהמשחק עדיין לא הסתיים או שנתוני הסטטיסטיקה אינם זמינים
        </p>
      </div>
    );
  }

  if (!boxScore || !boxScore.players || boxScore.players.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center" dir="rtl">
        <p className="text-gray-600">אין נתוני סטטיסטיקה זמינים למשחק זה</p>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="rtl">
      {boxScore.players.map((team, teamIndex) => {
        const teamStats = team.statistics[0];
        if (!teamStats) return null;

        const statNames = teamStats.names || [];
        const statKeys = teamStats.keys || [];
        const athletes = teamStats.athletes || [];
        const totals = teamStats.totals || [];

        // Determine if this is home team (second team in array) or away team
        const isHomeTeam = teamIndex === 1;
        const teamName = team.team?.displayName || "קבוצה";
        const teamColors = isHomeTeam ? homeColors : awayColors;

        return (
          <div key={teamIndex} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Team Header with Team Colors */}
            <div
              className="text-white px-6 py-4"
              style={{ background: `linear-gradient(135deg, ${teamColors.primary}, ${teamColors.secondary})` }}
            >
              <h3 className="text-xl font-bold">{teamName}</h3>
            </div>

            {/* Stats Table */}
            <div
              className="overflow-x-auto touch-pan-x"
              dir="ltr"
              ref={(el) => {
                if (el && el.scrollLeft === 0) {
                  // Set initial scroll position to the right (max scroll in LTR)
                  el.scrollLeft = el.scrollWidth - el.clientWidth;
                }
              }}
              tabIndex={0}
              role="region"
              aria-label={`טבלת נתונים ${teamName}`}
              onTouchStart={(e) => {
                // Force immediate scroll capture on touch
                e.currentTarget.style.pointerEvents = 'auto';
              }}
            >
              <table className="w-full" dir="rtl">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider sticky right-0 bg-gray-50 min-w-[150px]">
                      שחקן
                    </th>
                    {statNames.map((name, i) => (
                      <th
                        key={i}
                        className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap"
                      >
                        {translateStatName(name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {athletes.map((athlete, athleteIndex) => {
                    const stats = athlete.stats || [];
                    const playerName = athlete.athlete?.displayName || athlete.athlete?.name || "שחקן";

                    return (
                      <tr key={athleteIndex} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky right-0 bg-white hover:bg-gray-50 min-w-[150px]">
                          <div className="flex items-center gap-2">
                            <span>{playerName}</span>
                            {athlete.athlete?.jersey && (
                              <span className="text-xs text-gray-500">#{athlete.athlete.jersey}</span>
                            )}
                          </div>
                          {athlete.athlete?.position && (
                            <div className="text-xs text-gray-500">{athlete.athlete.position.abbreviation}</div>
                          )}
                        </td>
                        {stats.map((stat, statIndex) => (
                          <td
                            key={statIndex}
                            className="px-3 py-3 text-sm text-gray-700 text-center whitespace-nowrap font-medium"
                          >
                            {stat || "-"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}

                  {/* Totals Row */}
                  {totals && totals.length > 0 && (
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td className="px-4 py-3 text-sm text-gray-900 sticky right-0 bg-gray-100">
                        סה"כ קבוצה
                      </td>
                      {totals.map((total, totalIndex) => (
                        <td
                          key={totalIndex}
                          className="px-3 py-3 text-sm text-gray-900 text-center whitespace-nowrap"
                        >
                          {total || "-"}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper function to translate stat names to Hebrew
function translateStatName(name) {
  const translations = {
    "MIN": "דק'",
    "PTS": "נק'",
    "FG": "זריקות",
    "3PT": "3P",
    "FT": "עונשין",
    "REB": "ריבאונד",
    "OREB": "ריב' התקפה",
    "DREB": "ריב' הגנה",
    "AST": "אסיסטים",
    "TO": "איבודים",
    "STL": "חטיפות",
    "BLK": "חסימום",
    "PF": "עבירות",
    "+/-": "+/-",
  };

  return translations[name] || name;
}
