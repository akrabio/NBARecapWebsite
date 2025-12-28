"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTeamColors } from "./TeamColorProvider";

export default function RecapSummary({ content, homeTeam, awayTeam }) {
  const { homeColors, awayColors } = useTeamColors();

  // Custom renderers for markdown with team color styling
  const components = {
    h2: ({ children }) => (
      <h2
        className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 mt-8 border-r-4 pr-4"
        style={{ borderColor: homeColors.primary }}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 mt-6">
        {children}
      </h3>
    ),
    p: ({ children }) => {
      // Detect team names and wrap in colored spans
      const highlightTeams = (text) => {
        if (typeof text !== 'string') return text;

        let result = text;
        // Highlight home team
        result = result.replace(
          new RegExp(homeTeam, 'gi'),
          `<span style="color: ${homeColors.primary}; font-weight: 600;">${homeTeam}</span>`
        );
        // Highlight away team
        result = result.replace(
          new RegExp(awayTeam, 'gi'),
          `<span style="color: ${awayColors.primary}; font-weight: 600;">${awayTeam}</span>`
        );
        return <span dangerouslySetInnerHTML={{ __html: result }} />;
      };

      return (
        <p className="text-lg md:text-xl leading-loose text-gray-700 mb-6 text-right">
          {React.Children.map(children, child =>
            typeof child === 'string' ? highlightTeams(child) : child
          )}
        </p>
      );
    },
    strong: ({ children }) => (
      <strong className="font-black text-gray-900">{children}</strong>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-8 rounded-xl shadow-lg" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
        <table className="min-w-full border-collapse" style={{ willChange: 'auto' }}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead
        className="text-white font-bold"
        style={{ background: `linear-gradient(135deg, ${homeColors.primary}, ${awayColors.primary})` }}
      >
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-6 py-3 text-right text-sm font-bold">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-6 py-3 text-right text-gray-700 border-b border-gray-200">{children}</td>
    ),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
