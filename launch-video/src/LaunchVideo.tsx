import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { LAUNCH_VIDEO_FPS, LAUNCH_VIDEO_SCENES, launchVideoFrameCount } from "../timeline";

const LaunchScene: React.FC<{ title: string; index: number }> = ({ title, index }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(1, frame / 8);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020", color: "#f8fafc", justifyContent: "center", padding: 80 }}>
      <div style={{ opacity, fontSize: 28, letterSpacing: 2, textTransform: "uppercase", color: "#fb7185" }}>
        Cutroom · {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{ opacity, marginTop: 24, fontSize: 72, fontWeight: 650, maxWidth: 1400 }}>{title}</div>
    </AbsoluteFill>
  );
};

export const LaunchVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {LAUNCH_VIDEO_SCENES.map((scene, index) => (
        <Sequence
          key={scene.id}
          from={scene.startSec * fps}
          durationInFrames={(scene.endSec - scene.startSec) * fps}
        >
          <LaunchScene title={scene.title} index={index} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const LAUNCH_VIDEO_DURATION_IN_FRAMES = launchVideoFrameCount(LAUNCH_VIDEO_SCENES, LAUNCH_VIDEO_FPS);
