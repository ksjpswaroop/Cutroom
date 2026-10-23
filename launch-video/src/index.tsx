import React from "react";
import { Composition, registerRoot } from "remotion";
import { LAUNCH_VIDEO_FPS } from "../timeline";
import { LAUNCH_VIDEO_DURATION_IN_FRAMES, LaunchVideo } from "./LaunchVideo";

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={LAUNCH_VIDEO_DURATION_IN_FRAMES}
      fps={LAUNCH_VIDEO_FPS}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
