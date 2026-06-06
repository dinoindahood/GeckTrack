"""
config.py — all app-wide settings in one place

HOW IT WORKS:
  Rather than scattering magic strings and paths across every file,
  we keep everything here. When you move to iOS, you only update
  the paths in this one file.

  IMPORTANT: never commit your ARL token to git if you use version control.
  Add config.py to your .gitignore, or use a separate secrets file.
"""

import os

# ─── paths ────────────────────────────────────────────────────────────────────

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
DATA_DIR     = os.path.join(BASE_DIR, "data")
LIBRARY_FILE = os.path.join(DATA_DIR, "library.json")

# On iOS (Pythonista), swap the above to:
# BASE_DIR     = os.path.expanduser("~/Documents/musicapp")
# DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

# ─── deezer ───────────────────────────────────────────────────────────────────

# Paste your ARL token here.
# How to get it:
#   1. Log into deezer.com in your browser
#   2. F12 → Application tab → Cookies → deezer.com
#   3. Find the "arl" cookie → copy its value
DEEZER_ARL = "aeca329fc8a0f6111c17a0126824a764396915bd3f00bb2a28934321e93a2e5914f41d9c13678bee098d3cec915318cd457233d34b6200f8d9bb35236f7d5f0ed3bd14e25472bd39cf35d20e11178bedd56c50a6b2266ba5e70aeba436fe9bbc"

# Download quality: "MP3_128", "MP3_320", "FLAC"
# MP3_128 works on a free account.
# MP3_320 and FLAC require a Deezer Premium subscription.
DEEZER_QUALITY = "MP3_128"

# ─── youtube ──────────────────────────────────────────────────────────────────

# Maximum number of search results to fetch from YouTube at once.
YOUTUBE_SEARCH_LIMIT = 15

# Audio quality for YouTube downloads (kbps).
# 192 is a good balance of quality and file size.
YOUTUBE_AUDIO_QUALITY = "192"

# ─── app ──────────────────────────────────────────────────────────────────────

# How many results to show per source in the search screen.
SEARCH_RESULTS_LIMIT = 15

# Default volume on startup (0.0 – 1.0).
DEFAULT_VOLUME = 0.8

ENTRY_MAPPING = {
    "title":    "Bohemian Rhapsody",
    "artist":   "Queen",
    "duration": 354,          # seconds, int
    "source":   "deezer",     # "deezer" or "youtube"
    "id":       "123456",     # deezer track id  OR  youtube video id
    "thumb":    "https://...", # thumbnail/cover url
  }