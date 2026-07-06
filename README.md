# STRIKE

Fast Expo MVP prototype for sea trout anglers. It demonstrates the core demo flow:

1. Start a fishing trip.
2. Track a route with GPS.
3. Register contacts, lost fish, and catches.
4. Attach a catch photo and notes.
5. Stop the trip and review the summary.
6. Browse previous trips in the logbook.

## Stack

- React Native + Expo
- Expo Router file-based navigation
- TypeScript
- Zustand in one store file
- `react-native-maps`
- Expo Location
- Expo Image Picker
- Expo Haptics

## Setup

```bash
npm install
npx expo start --lan --clear
```

Then open the app in Expo Go or an iOS/Android simulator. For the best demo, use a real device so GPS and photo picking are available.

This prototype is pinned to Expo SDK 54 for Expo Go compatibility.

## Structure

- `app/` contains all screens and file-based routes.
- `components/` contains reusable UI and tracking components.
- `store/useStrikeStore.ts` contains the full local state model and actions.
- `data/weather.ts` contains static mock weather.

## Demo Notes

Real device GPS is used when the user grants foreground location permission. If permission is denied or unavailable, STRIKE automatically falls back to a mocked coastal route so the investor demo still works smoothly.

There is no backend, authentication, payments, cloud sync, or analytics. The prototype is intentionally local and lightweight.
