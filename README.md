# GeckTrack

A hybrid desktop music player for Windows that searches across YouTube and Deezer, streams previews, downloads high-quality audio, and features an AI-driven track discovery system.

---

## Download (Pre-built)

No setup required — grab the installer from the Releases page:

1. Go to the **[Releases](https://github.com/YOUR_USERNAME/YOUR_REPO/releases)** page
2. Download `GeckTrack Setup 0.0.1.exe` (or the latest version)
3. Run it — done. No Python, no pip, no ffmpeg needed on your end.

> Requirements: Windows 10/11, ~250 MB disk space.

---

## Features

- **Multi-platform search** — Search YouTube and Deezer from a single bar
- **Stream previews** — 30-second free previews without downloading
- **High-quality downloads** — Grab audio as 192kbps MP3/M4A
- **Permanent library** — Downloads persist in a local folder, organized by title and artist
- **Playlists** — Create, edit, and manage custom playlists with custom icons
- **Magic Suggest (AI)** — Powered by YouTube Music's algorithm — gives you 5 related tracks based on what you're currently playing
- **Audio trimmer** — Cut any downloaded track to a custom start/end time
- **Dark/Light theme** — Toggle between minty light and deep plum modes
- **System tray** — Minimizes to tray, stays running in background
- **Taskbar controls** — Play/pause/next/previous right from the Windows taskbar

---

## Tech Stack

| Layer | Tech | Role |
|---|---|---|
| Desktop shell | Electron | App window, tray, taskbar buttons |
| Frontend | HTML5 / CSS / JS | UI, player, search, modals |
| Backend API | Flask (Python) | Bridges frontend → music services |
| YouTube search & download | yt-dlp | Search and download audio |
| Deezer search | Deezer public API + ARL token | Track metadata |
| AI suggestions | ytmusicapi | Algorithmic radio based on current track |
| Audio conversion | FFmpeg | Converts to 192kbps MP3 |

---

## Project Structure

```
musicapp/
├── main.js                 # Electron main process — starts the app
├── server.py               # Flask backend — all API endpoints
├── server.spec             # PyInstaller config — builds server.exe
├── config.py               # ARL token, paths, quality settings
├── requirements.txt         # Python pip dependencies
│
├── core/                   # Backend modules
│   ├── search.py           # YouTube + Deezer search
│   ├── downloader.py       # yt-dlp audio download + conversion
│   ├── library.py          # Local library JSON management
│   ├── playlists.py       # Playlist CRUD + track membership
│   ├── ai_suggest.py       # Magic Suggest (YouTube Music radio)
│   └── trimmer.py          # FFmpeg audio trimming
│
├── ui/                     # Frontend (served by Electron)
│   ├── index.html          # Main HTML
│   ├── renderer.js         # All UI logic, API calls, player
│   ├── style.css          # Pixel-art theme, dark/light modes
│   └── assets/             # Icons, GIFs, images
│
├── backend/
│   └── server.exe          # PyInstaller build of server.py
│
├── data/                   # Runtime data (created on first run)
│   ├── library.json        # Your downloaded tracks
│   └── playlists.json      # Your playlists
│
└── downloads/              # Downloaded audio files (created on first download)
```

---

## Dev Setup (if you want to run from source)

### 1. Install Python 3.10+ and Node.js

### 2. Install FFmpeg
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add `ffmpeg.exe` to your system PATH.

### 3. Install Python dependencies

```bash
cd musicapp
pip install -r requirements.txt
```

### 4. Set your Deezer ARL token

1. Log into [deezer.com](https://deezer.com) in your browser
2. Open DevTools (`F12`) → Application → Cookies → deezer.com
3. Find the `arl` cookie and copy its value
4. Open `config.py` and paste the token as `DEEZER_ARL`

> ⚠️ Never commit `config.py` to git — it contains your private token.

### 5. Run the Electron app

```bash
cd musicapp
npm install
npm run start
```

---

## Building from Source

### Prerequisites
- Python 3.10+ with all `requirements.txt` packages
- Node.js 18+
- FFmpeg in PATH

### Steps

```bash
# 1. Build the Python backend (server.exe)
cd musicapp
pyinstaller server.spec --clean

# 2. Copy the output to the backend folder
cp dist/server.exe backend/server.exe

# 3. Build the Electron app
npm run dist
```

The installer will appear in `release/GeckTrack Setup X.X.X.exe`.

---

## Keyboard / Mouse Controls

| Action | How |
|---|---|
| Play / Pause | Click the play button or use Windows taskbar buttons |
| Next / Previous | ⏭ ⏮ buttons or taskbar controls |
| AI Suggestions | ✨ button in the player bar |
| Search | Type in the search bar, hit YouTube or Deezer button |
| Download | Click "⬇ Download" on any search result |
| Edit track info | ⋮ menu → ✏️ Edit Info |
| Trim audio | ⋮ menu → ✂️ Trim Audio |
| Delete track | ⋮ menu → 🗑️ Delete Song |
| Add to playlist | ⋮ menu → ➕ Add to Playlist |
| Toggle theme | 🌙 button in the top-right corner |

---

## Troubleshooting

**"No free preview available"** — Some Deezer tracks don't have 30-second previews. Try the YouTube source instead.

**AI suggestions not working** — Make sure your internet connection is active. The Magic Suggest feature calls YouTube Music's API in real-time.

**FFmpeg error on trim** — Make sure FFmpeg is installed and added to your system PATH. Run `ffmpeg -version` in a terminal to verify.

**Server not starting** — If the app crashes on launch, check that no other process is holding port 5000. Run `netstat -aon | findstr :5000` to check.