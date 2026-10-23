# Cutroom launch video (Remotion)

This folder is a side project. The desktop app does not import it and has no `/launch` route.

The timeline in `timeline.ts` follows `docs/launch-video/shot-list.md`: 0:00 through 5:05, 30 fps, 1920×1080.

```bash
cd launch-video
npm install
npm run studio
npm run render
```

`npm run render` writes `launch-video/out/launch-video.mp4`. That file is a title-card film of the shot list, not a recording of the product.
