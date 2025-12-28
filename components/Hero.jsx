"use client";

import { motion } from "framer-motion";

// Basketball Logo Component with Hebrew text
const BasketballLogo = () => {
  return (
    <div className="relative w-24 h-24 md:w-28 md:h-28">
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 blur-xl opacity-60"></div>

      {/* Basketball */}
      <svg viewBox="0 0 100 100" className="relative w-full h-full drop-shadow-2xl">
        {/* Basketball circle with gradient */}
        <defs>
          <radialGradient id="ballGradient" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#ff8c42" />
            <stop offset="50%" stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#d94e2a" />
          </radialGradient>
        </defs>

        {/* Main ball */}
        <circle cx="50" cy="50" r="48" fill="url(#ballGradient)" stroke="#fff" strokeWidth="1" />

        {/* Basketball lines */}
        <path d="M 50 2 Q 35 50 50 98" stroke="#000" strokeWidth="1.5" fill="none" opacity="0.3" />
        <path d="M 50 2 Q 65 50 50 98" stroke="#000" strokeWidth="1.5" fill="none" opacity="0.3" />
        <ellipse cx="50" cy="50" rx="48" ry="20" stroke="#000" strokeWidth="1.5" fill="none" opacity="0.3" />

        {/* Hebrew text "NBA" */}
        <text x="50" y="55" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="900" className="drop-shadow-lg" fontFamily="system-ui">
          NBA
        </text>
      </svg>
    </div>
  );
};

export default function Hero() {
  return (
    <motion.section
      className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      dir="rtl"
    >
      {/* Basketball court pattern background */}
      <div className="absolute inset-0 opacity-10">
        {/* Court outline */}
        <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
          {/* Center circle */}
          <circle cx="400" cy="200" r="60" stroke="white" strokeWidth="3" fill="none" />
          <circle cx="400" cy="200" r="20" stroke="white" strokeWidth="2" fill="none" />

          {/* Half court line */}
          <line x1="400" y1="0" x2="400" y2="400" stroke="white" strokeWidth="3" />

          {/* Left three-point arc */}
          <path d="M 100 50 Q 150 200 100 350" stroke="white" strokeWidth="2" fill="none" />

          {/* Right three-point arc */}
          <path d="M 700 50 Q 650 200 700 350" stroke="white" strokeWidth="2" fill="none" />

          {/* Left key */}
          <rect x="50" y="120" width="120" height="160" stroke="white" strokeWidth="2" fill="none" />

          {/* Right key */}
          <rect x="630" y="120" width="120" height="160" stroke="white" strokeWidth="2" fill="none" />

          {/* Free throw circles */}
          <circle cx="170" cy="200" r="60" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="630" cy="200" r="60" stroke="white" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Gradient orbs */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-16 flex flex-col items-center justify-center">
        {/* Basketball Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6"
        >
          <BasketballLogo />
        </motion.div>

        <motion.h1
          className="text-4xl md:text-6xl font-black text-white text-center mb-3 drop-shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          סיכומי NBA בעברית
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-blue-100 font-medium text-center max-w-2xl drop-shadow"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          ניתוח סטטיסטי מעמיק ומקצועי של משחקי NBA
        </motion.p>
      </div>
    </motion.section>
  );
}
