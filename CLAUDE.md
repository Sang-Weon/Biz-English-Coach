# CLAUDE.md

This file provides guidance for AI assistants working with the NativeBiz English Coach codebase.

## Project Overview

NativeBiz English Coach is an AI-powered business English learning application. Users practice English through real-world business news briefings, pronunciation shadowing with AI feedback, and discussion sessions with grammar/vocabulary evaluation. Built with Next.js (App Router) and Google Gemini AI.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.8
- **Styling:** Tailwind CSS 4, PostCSS, tailwindcss-animate
- **UI Components:** shadcn/ui (New York style), Radix UI, Lucide icons, CVA
- **AI Backend:** Google Gemini AI (`@google/genai`)
- **Analytics:** Vercel Analytics
- **Package Manager:** pnpm (lockfile: `pnpm-lock.yaml`)

## Project Structure

```
app/
  api/gemini/route.ts    # Server-side Gemini API route handler (8 actions)
  globals.css            # Tailwind + CSS custom properties (design tokens)
  layout.tsx             # Root layout with metadata, fonts, analytics
  page.tsx               # Main application component (all UI phases)
components/
  ui/button.tsx          # shadcn Button component
  recorder.tsx           # Audio recording with waveform visualization
  theme-provider.tsx     # next-themes wrapper (not fully integrated)
lib/
  audio-utils.ts         # Base64/AudioBuffer/Blob audio conversion
  gemini-client.ts       # Client-side wrapper for /api/gemini calls
  types.ts               # TypeScript types and AppState enum
  utils.ts               # cn() helper (clsx + tailwind-merge)
public/                  # PWA manifest, icons, static assets
```

## Commands

```bash
pnpm dev        # Start development server
pnpm build      # Production build (TypeScript errors are ignored via next.config.mjs)
pnpm start      # Start production server
```

There is no test runner, linter, or formatter configured. The CI workflow (`.github/workflows/node.js.yml`) calls `npm test` but no test script exists in package.json.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for AI features) | Google AI Studio API key. Set in `.env.local` for development. |

When `GEMINI_API_KEY` is missing, the app runs in **demo mode** with mock data, allowing UI testing without API calls.

## Architecture

### Application State Machine

The app follows a linear learning flow managed by the `AppState` enum (`lib/types.ts`):

```
ONBOARDING → TOPIC_SELECTION → BRIEFING_GENERATION → LISTENING_PHASE
    → SHADOWING_PHASE → DISCUSSION_PHASE → DISCUSSION_FEEDBACK
```

All state is managed in `app/page.tsx` via React hooks. User preferences (selected interest categories) are persisted to localStorage under the key `nativebiz_preferences`.

### API Route: `/api/gemini`

The single route handler (`app/api/gemini/route.ts`) dispatches on an `action` field in the request body. Supported actions:

| Action | Purpose |
|--------|---------|
| `generateTopics` | Generate business topics from user preferences |
| `generateBriefing` | Create a professional briefing with sentences |
| `generateSpeech` | Text-to-speech via Gemini TTS model |
| `getTranslation` | Translate words to Korean with definitions |
| `analyzeShadowing` | Evaluate pronunciation from recorded audio |
| `generateDiscussionQuestion` | Create conversation prompts |
| `analyzeDiscussionResponse` | Evaluate speaking responses with grammar/vocab feedback |

Each action has a demo mode fallback that returns mock data.

### Gemini Models Used

- **Text/Content:** `gemini-2.5-flash-preview-04-17`
- **TTS:** `gemini-2.5-flash-preview-tts` (Kore voice preset)
- **Audio Analysis:** `gemini-2.5-flash-preview-04-17`

### Client-Server Flow

```
page.tsx → lib/gemini-client.ts → POST /api/gemini → Google Gemini API
```

The client calls functions in `gemini-client.ts`, which POST to the API route. The route handler calls Gemini and returns JSON. Audio is exchanged as base64-encoded strings.

## Key Conventions

### Code Style

- No ESLint or Prettier configuration exists. Follow existing code patterns.
- Path aliases use `@/*` mapping to the project root (configured in `tsconfig.json`).
- Components use function declarations with TypeScript interfaces for props.
- CSS uses Tailwind utility classes. Design tokens are defined as CSS custom properties in `app/globals.css` using OKLCH color space.

### Component Patterns

- UI components in `components/ui/` follow shadcn/ui conventions (CVA variants, `asChild` via Radix Slot).
- The `cn()` utility (`lib/utils.ts`) merges Tailwind classes. Always use it when combining conditional classes.
- The main page component (`app/page.tsx`) is a large client component (`"use client"`) that manages the entire app flow. New features that add phases should follow the existing state machine pattern.

### Audio Handling

- Recording uses the Web Audio API and MediaRecorder (`components/recorder.tsx`).
- Audio utilities in `lib/audio-utils.ts` handle format conversion between base64, Blob, and AudioBuffer.
- TTS audio comes back from Gemini as base64-encoded PCM/WAV and is decoded client-side.

### Adding New shadcn/ui Components

The project uses shadcn/ui with the configuration in `components.json`. To add components:

```bash
npx shadcn@latest add <component-name>
```

Components are placed in `components/ui/` with Tailwind CSS variables for theming.

## Deployment

- **Recommended:** Vercel (auto-detects Next.js, set `GEMINI_API_KEY` in dashboard)
- **Alternatives:** Netlify, GitHub Pages (see `DEPLOYMENT.md` for details)
- PWA-ready with manifest at `public/manifest.json`

## Common Pitfalls

- `next.config.mjs` has `ignoreBuildErrors: true` for TypeScript — the build will succeed even with type errors. Run `npx tsc --noEmit` to check types manually.
- The CI workflow uses `npm` but the lockfile is `pnpm-lock.yaml`. Use `pnpm` for local development.
- `app/page.tsx` is ~930 lines. When modifying it, be careful with the state machine transitions and the numerous `useRef`/`useState` hooks at the top.
- The `next-themes` package is imported in `theme-provider.tsx` but is not listed in `package.json` dependencies and the provider is not wired into the layout.
