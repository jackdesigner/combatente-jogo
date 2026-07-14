import React from "react";

/**
 * ProgressSprite component displays the animated soldier over the static background
 * and moves it according to the game position (1‑40).
 *
 * Props
 * -----
 * position: number – current tile (1–40)
 * lastRoll: number – most recent dice roll (used to select animation)
 */
export default function ProgressSprite({ position, lastRoll }) {
  // Clamp position between 1 and 40
  const pos = Math.min(Math.max(position, 1), 40);
  // Percentage across the track (0‑100)
  const pct = ((pos - 1) / (40 - 1)) * 100;
  const left = `calc(${pct}% - 100px * (${pct} / 100))`;

  // Choose animation based on the last dice roll
  let animClass = "idle";
  if (lastRoll >= 4) {
    animClass = "run";
  } else if (lastRoll > 0) {
    animClass = "walk";
  }

  return (
    <div id="progress-sprite" className="sprite-container">
      <div
        id="soldado"
        className={animClass}
        style={{ left }}
      ></div>
    </div>
  );
}
