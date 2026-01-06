"use client";

import { motion } from "framer-motion";

export default function Hero() {
  return (
    <motion.section
      className="relative overflow-hidden hero-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      dir="rtl"
      style={{
        backgroundImage: "url('/hero_background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark blue tinted overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(11, 24, 65, 0.1)",
          mixBlendMode: "multiply"
        }}
      ></div>

      {/* Additional subtle gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/30 to-blue-950/50"></div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-16 flex flex-col items-center justify-center">
        {/* Basketball Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6"
        >
        </motion.div>

        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h1
            className="text-4xl md:text-6xl font-black text-center mb-6 drop-shadow-lg"
            style={{
              background: "linear-gradient(to bottom, #ffffff, #e0e7ff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "0.02em",
            }}
          >
            סיכומי NBA בעברית
          </h1>
        </motion.div>

        <motion.p
          className="text-lg md:text-xl text-blue-50 font-medium text-center max-w-2xl drop-shadow-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{
            letterSpacing: "0.01em",
            lineHeight: "1.6",
          }}
        >
          ניתוח סטטיסטי מעמיק ומקצועי של משחקי NBA
        </motion.p>
      </div>
    </motion.section>
  );
}
