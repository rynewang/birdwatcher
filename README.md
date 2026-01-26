# Bird Watcher PWA

<img src="icons/icon-192.png" alt="Bird Watcher icon" width="96">

A Progressive Web App that uses TensorFlow.js COCO-SSD to automatically detect and record birds visiting your bird feeder.

## Features

- **AI Bird Detection**: Uses COCO-SSD model to identify birds in real-time
- **Smart Recording**: Starts when a bird appears, stops 10 seconds after it leaves
- **Draggable Detection Zone**: Position the detection area over your feeder
- **Detection Zoom**: For distant feeders where birds appear small
- **Adjustable Sensitivity**: Tune confidence threshold for your setup
- **Video Quality Settings**: Choose bitrate from 1-8 Mbps
- **Share to Photos**: Save clips to your camera roll (iOS) via share sheet
- **Completely Local**: All processing on-device, videos never leave your phone
- **Offline Support**: Works offline after initial load (PWA)

## Quick Start

```bash
# Start local server (no build step required)
npx serve .
```

Then open http://localhost:3000 in your browser.

For mobile testing, use a tunnel like cloudflared:
```bash
cloudflared tunnel --url http://localhost:3000
```

## Usage

1. **Grant camera permission** when prompted
2. **Position your device** facing your bird feeder
3. **Drag the detection zone** (dashed rectangle) over your feeder
4. The app will automatically:
   - Detect birds using AI
   - Start recording when birds appear
   - Stop 10 seconds after bird leaves
5. Tap **Review** to view recorded clips
6. Tap **Download** to share/save to Photos

## Settings

- **Show debug logs**: Enable green toast messages for debugging
- **Video bitrate**: 1-8 Mbps (affects file size and quality)
- **Detection sensitivity**: Lower = detects less confident birds
- **Detection zoom**: For small/distant birds (crops center of frame)

## Privacy

- All AI processing happens on your device
- Videos are stored locally in IndexedDB
- Nothing is ever sent to any server
- You control your data completely

## Project Structure

```
birdwatching/
├── index.html          # Main HTML
├── style.css           # Dark theme styles
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── src/
│   ├── app.js          # Main orchestration
│   ├── config.js       # Configuration
│   ├── camera.js       # Camera access
│   ├── bird-detector.js    # TensorFlow.js COCO-SSD wrapper
│   ├── recorder.js     # MediaRecorder wrapper
│   ├── storage.js      # IndexedDB operations
│   └── ui.js           # UI management
└── icons/              # PWA icons
```

## Requirements

- Modern browser with camera support (Safari, Chrome)
- HTTPS connection (required for camera access)
- For local development: `npx serve .` or similar

## Tech Stack

- Vanilla JavaScript (ES modules, no build step)
- TensorFlow.js + COCO-SSD (loaded from CDN)
- MediaRecorder API (MP4 on Safari, WebM on Chrome)
- IndexedDB for clip storage
- Web Share API for saving to Photos

## License

MIT
