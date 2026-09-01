"use client";

import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
} from "@/components/ai-elements/web-preview";
import { cn } from "@cartwright/ui/lib/utils";
import {
  Globe,
  Maximize2Icon,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SessionLog {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
}

export interface SessionWebPreviewProps {
  url?: string;
  liveFrame?: string | null;
  videoUrl?: string | null;
  isLivePending?: boolean;
  onClose?: () => void;
  logs?: SessionLog[];
  availableRecordings?: string[];
  selectedRecording?: string | null;
  onSelectRecording?: (rec: string) => void;
}

function formatVideoTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SessionWebPreview({
  url = "https://amazon.in",
  liveFrame,
  videoUrl,
  isLivePending = false,
  onClose,
  logs = [],
  availableRecordings = [],
  selectedRecording,
  onSelectRecording,
}: SessionWebPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"live" | "video">("live");

  // Video playback state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const hasLiveFeed = isLivePending || Boolean(liveFrame);
  const hasVideo = Boolean(videoUrl);

  const activeView =
    viewMode === "video" && hasVideo
      ? "video"
      : hasLiveFeed
      ? "live"
      : hasVideo
      ? "video"
      : "live";

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsVideoMuted(videoRef.current.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setVideoCurrentTime(time);
    }
  };

  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch(() => {});
  };

  return (
    <div ref={containerRef} className="flex size-full flex-col overflow-hidden bg-card text-foreground">
      <WebPreview defaultUrl={url} className="size-full rounded-none border-0 bg-transparent flex flex-col">
        {/* Navigation / Toolbar with only Fullscreen & Close buttons */}
        <WebPreviewNavigation className="border-b border-border bg-muted px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-foreground">
            {activeView === "video" ? "Session Recording" : "Agent Browser"}
          </span>

          <div className="flex items-center gap-1">
            <WebPreviewNavigationButton tooltip="Fullscreen" onClick={handleToggleFullscreen}>
              <Maximize2Icon className="size-3.5 text-muted-foreground" />
            </WebPreviewNavigationButton>
            {onClose && (
              <WebPreviewNavigationButton tooltip="Close panel" onClick={onClose}>
                <X className="size-3.5 text-muted-foreground" />
              </WebPreviewNavigationButton>
            )}
          </div>
        </WebPreviewNavigation>

        {/* Viewport Frame */}
        <div className="flex-1 bg-muted overflow-hidden flex flex-col justify-center relative min-h-0">
          {activeView === "video" && videoUrl ? (
            <div className="group/video relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setVideoCurrentTime(videoRef.current.currentTime);
                    setVideoDuration(videoRef.current.duration || 0);
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setVideoDuration(videoRef.current.duration || 0);
                  }
                }}
                onEnded={() => setIsVideoPlaying(false)}
              />

              {!isVideoPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto h-14 w-14 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center backdrop-blur-xs hover:scale-110 hover:bg-black/80 transition-all cursor-pointer shadow-2xl z-10"
                  title="Play video"
                >
                  <Play className="h-6 w-6 fill-white translate-x-0.5" />
                </button>
              )}

              {/* Video Scrubber & Controls */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 space-y-2 opacity-95 transition-opacity z-10">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 100}
                    step={0.1}
                    value={videoCurrentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-white hover:accent-purple-400 transition-all"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-foreground">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="p-1 rounded hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title={isVideoPlaying ? "Pause (Space)" : "Play (Space)"}
                    >
                      {isVideoPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestart}
                      className="p-1 rounded hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Restart video"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-1 rounded hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title={isVideoMuted ? "Unmute" : "Mute"}
                    >
                      {isVideoMuted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <span className="font-mono text-[11px] text-muted-foreground pl-1">
                      {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : activeView === "live" && liveFrame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={liveFrame}
              alt="Live view of the agent's browser"
              className="w-full h-full object-contain"
            />
          ) : isLivePending ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <div className="h-6 w-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
              <span className="text-xs text-muted-foreground">Streaming live browser feed…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-2.5 text-muted-foreground">
              <Globe className="h-8 w-8 text-muted-foreground/50 stroke-[1.5]" />
              <p className="text-xs font-medium text-muted-foreground">Viewport Standby</p>
              <p className="text-[11px] text-muted-foreground max-w-[220px]">
                Live browser stream or session recording will appear here when available.
              </p>
            </div>
          )}
        </div>
      </WebPreview>
    </div>
  );
}

export default SessionWebPreview;
