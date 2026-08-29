"use client";

import { useEffect, useRef } from "react";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset to start slightly before end to avoid any frame hold
    const handleTimeUpdate = () => {
      if (video.duration - video.currentTime <= 0.1) {
        video.currentTime = 0;
        video.play();
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      className="absolute inset-0 h-full w-full object-cover"
    >
      <source src="/upscaled-video-hq.mp4" type="video/mp4" />
    </video>
  );
}
