# Deployment Guide for NativeBiz English Coach

## Prerequisites

- Node.js (v18 or higher)
- A Gemini API Key from Google AI Studio
- A hosting service (Vercel, Netlify, or any static hosting)

## Environment Setup

1. Create a `.env.local` file in the project root:
```bash
GEMINI_API_KEY=your_actual_api_key_here
```

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at `http://localhost:3000`

## Building for Production

```bash
# Build the app
npm run build

# Preview the production build
npm run preview
```

The built files will be in the `dist/` directory.

## Deployment Options

### Option 1: Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Add environment variable in Vercel dashboard:
   - Go to your project settings
   - Add `GEMINI_API_KEY` with your API key

### Option 2: Netlify

1. Install Netlify CLI:
```bash
npm i -g netlify-cli
```

2. Build and deploy:
```bash
npm run build
netlify deploy --prod --dir=dist
```

3. Add environment variable in Netlify dashboard:
   - Go to Site settings > Environment variables
   - Add `GEMINI_API_KEY`

### Option 3: GitHub Pages

1. Update `vite.config.ts` with your GitHub repo name:
```typescript
export default defineConfig({
  base: '/your-repo-name/',
  // ... rest of config
})
```

2. Add deployment script to `package.json`:
```json
{
  "scripts": {
    "deploy": "npm run build && gh-pages -d dist"
  }
}
```

3. Install gh-pages:
```bash
npm install --save-dev gh-pages
```

4. Deploy:
```bash
npm run deploy
```

## Mobile & PWA Features

The app is fully responsive and includes PWA capabilities:

- **Mobile Optimized**: Touch-friendly UI with responsive design
- **Offline Support**: Can be installed as a PWA on mobile devices
- **Add to Home Screen**: iOS and Android support
- **Safe Area Support**: Works properly with notched devices

### Installing on Mobile

**iOS:**
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

**Android:**
1. Open the app in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen" or "Install App"

## Features

✅ **Onboarding**: Category selection for personalized topics
✅ **Local Storage**: Preferences saved locally
✅ **Responsive Design**: Works on mobile, tablet, and desktop
✅ **Touch Support**: Full touch and gesture support
✅ **PWA Ready**: Can be installed as a native-like app

## Troubleshooting

**Issue**: API key not working
- Ensure `GEMINI_API_KEY` is set correctly in your environment
- Check that the API key has the necessary permissions

**Issue**: Build fails
- Run `npm install` to ensure all dependencies are installed
- Clear the cache: `rm -rf node_modules dist && npm install`

**Issue**: Mobile layout issues
- Clear browser cache
- Ensure you're using the latest version of the app

## Support

For issues or questions, please check the repository's issue tracker.
