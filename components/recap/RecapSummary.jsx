"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTeamColors } from "./TeamColorProvider";
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function RecapSummary({ content, homeTeam, awayTeam, gameId }) {
  const { homeColors, awayColors } = useTeamColors();
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(true);

  // Fetch game images
  useEffect(() => {
    if (!gameId) {
      setImagesLoading(false);
      return;
    }

    const fetchImages = async () => {
      try {
        const response = await fetch(`/api/game-images/${gameId}`);
        if (response.ok) {
          const data = await response.json();
          setImages(data.images || []);
        }
      } catch (error) {
        console.error('Error fetching game images:', error);
      } finally {
        setImagesLoading(false);
      }
    };

    fetchImages();
  }, [gameId]);

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
      <div
        className="overflow-x-auto my-8 rounded-xl shadow-lg touch-pan-x"
        dir="ltr"
        ref={(el) => {
          if (el && el.scrollLeft === 0) {
            // Set initial scroll position to the right (max scroll in LTR)
            el.scrollLeft = el.scrollWidth - el.clientWidth;
          }
        }}
        onTouchStart={(e) => {
          // Force immediate scroll capture on touch
          e.currentTarget.style.pointerEvents = 'auto';
        }}
      >
        <table className="min-w-full border-collapse" dir="rtl">
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

  // Split content into sections by paragraphs and headers
  const splitContentIntoSections = (content) => {
    if (!content) return [];

    // Split by double newlines (paragraphs) or headers
    const parts = content.split(/\n\n+/);
    return parts.filter(part => part.trim().length > 0);
  };

  const contentSections = splitContentIntoSections(content);

  // Calculate positions to insert images (evenly distributed in the first 2/3 of content)
  const getImagePositions = (totalSections, imageCount) => {
    if (totalSections <= 2 || imageCount === 0) return [];

    // Place images in the first 2/3 of the content, evenly spaced
    const contentRange = Math.floor(totalSections * 0.67);
    const positions = [];

    if (imageCount === 1) {
      positions.push(Math.floor(contentRange / 2));
    } else if (imageCount === 2) {
      // Distribute 2 images: one at ~1/3, one at ~2/3 of content
      positions.push(Math.floor(contentRange / 3));
      positions.push(Math.floor((contentRange * 2) / 3));
    }

    return positions;
  };

  const imagePositions = getImagePositions(contentSections.length, images.length);

  // Image component
  const ImageDisplay = ({ image, index }) => (
    <div className="my-8 rounded-xl overflow-hidden shadow-lg">
      <div className="relative aspect-video w-full bg-gray-100">
        <Image
          src={image.url}
          alt={image.caption || `Game image ${index + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 896px"
          unoptimized
        />
      </div>
      {image.caption && (
        <div className="bg-gray-50 px-4 py-2">
          <p className="text-sm text-gray-600 text-center">
            {image.caption}
          </p>
          {image.credit && (
            <p className="text-xs text-gray-400 text-center mt-1">
              {image.credit}
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      {contentSections.map((section, index) => {
        const imageIndex = imagePositions.indexOf(index);
        const shouldShowImage = imageIndex >= 0 && imageIndex < images.length;

        return (
          <React.Fragment key={index}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {section}
            </ReactMarkdown>

            {/* Show image after this section if it's at an image position */}
            {shouldShowImage && !imagesLoading && (
              <ImageDisplay image={images[imageIndex]} index={imageIndex} />
            )}

            {/* Show loading placeholder for first image */}
            {imagesLoading && imageIndex === 0 && (
              <div className="my-8 rounded-xl overflow-hidden shadow-lg bg-gray-100 aspect-video flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
