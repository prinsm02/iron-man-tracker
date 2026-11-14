# app

Source of the Iron Man GPS training app (Expo, React Native, TypeScript). This folder is the public GitHub repo `iron-man-tracker`; no personal data or tokens live here.

- `App.tsx` screen switcher, `index.ts` entry (loads the background GPS task first)
- `src/lib` maths (geo.ts), GPX/CSV (export.ts), phone storage (db.ts), settings, GitHub sync
- `src/tracking/tracker.ts` recording engine, `src/screens` screens, `src/ui/kit.tsx` look
- `.github/workflows/build-ios.yml` free unsigned .ipa build

See `../00 How To Run.md`.

## Where this came from
Created 2026-11-14 by Claude from the Expo blank-typescript template (SDK 58).
