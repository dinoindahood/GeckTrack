"""
downloader.py — takes a search result and saves the audio file locally
"""
import os
import sys
import yt_dlp

# --- PATH INTELLIGENCE & FOLDER CREATION ---
if getattr(sys, 'frozen', False):
    # If in the .exe, save to resources/downloads so they are permanent!
    real_base = os.path.dirname(os.path.dirname(sys.executable))
else:
    # If in PyCharm, save to the normal dev downloads folder
    real_base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

DOWNLOAD_DIR = os.path.join(real_base, "downloads")

# THE FIX: Create the downloads folder instantly so yt-dlp never crashes looking for it!
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def download_track(result: dict, on_progress=None) -> str | None:
    source = result.get("source")
    if source == "deezer":
        return _download_from_deezer(result, on_progress)
    elif source == "youtube":
        return _download_from_youtube(result, on_progress)
    else:
        return None


def _download_from_deezer(result: dict, on_progress=None) -> str | None:
    filename = _make_filename(result)
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    query = f"{result.get('artist', '')} {result.get('title', '')} audio"

    ydl_opts = {
        'format': 'm4a/bestaudio/best',
        'outtmpl': filepath,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'nocheckcertificate': True,
        'http_chunk_size': 10485760,
        'retries': 10,
        'fragment_retries': 10,
        'extractor_args': {'youtube': ['player_client=android']}
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query}", download=True)
        # yt-dlp picks the output extension; detect what was actually saved
        if info and info.get('filename') and os.path.exists(info['filename']):
            return info['filename']
        # Fallback: try common extensions if yt-dlp added one automatically
        for ext in ['', '.m4a', '.mp3', '.webm']:
            if os.path.exists(filepath + ext):
                return filepath + ext
        return filepath  # last resort — let library handle it
    except Exception as e:
        return None


def _download_from_youtube(result: dict, on_progress=None) -> str | None:
    filename = _make_filename(result)
    filepath = os.path.join(DOWNLOAD_DIR, filename)

    opts = {
        "format": "bestaudio/best",
        "outtmpl": filepath,
        "quiet": True,
        "remote_components": ["ejs:github"],
        "js_runtimes": {
            "node": {
                "path": r"D:\nodejs"  # Fixed to match your search.py settings!
            }
        },
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "progress_hooks": [_make_progress_hook(on_progress)],
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://youtube.com/watch?v={result['id']}", download=True)
        # yt-dlp saves to the outtmpl path — find what was actually created
        actual_ext = os.path.splitext(info['filename'])[1] if info.get('filename') else '.m4a'
        actual_path = filepath + actual_ext
        # If yt-dlp named it differently (no ext in outtmpl), detect it
        if not os.path.exists(actual_path):
            # Try the bare filepath — yt-dlp may have added extension itself
            for candidate in [filepath, filepath + '.m4a', filepath + '.webm']:
                if os.path.exists(candidate):
                    return candidate
        return actual_path
    except Exception as e:
        return None


def _make_progress_hook(on_progress):
    def hook(d):
        if on_progress is None:
            return
        if d["status"] == "downloading":
            downloaded = d.get("downloaded_bytes", 0)
            total      = d.get("total_bytes") or d.get("total_bytes_estimate", 1)
            percent    = int((downloaded / total) * 100)
            on_progress(percent)
        elif d["status"] == "finished":
            on_progress(100)
    return hook


def _make_filename(result: dict) -> str:
    artist = result.get("artist", "Unknown")
    title  = result.get("title",  "Unknown")
    raw    = f"{artist} - {title}"
    safe   = "".join(c if c.isalnum() or c in " -_()" else "" for c in raw)
    safe   = safe.replace(" ", "_")
    return safe.replace('.mp3', '')