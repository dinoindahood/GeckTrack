"""
search.py — handles all music searching (Deezer + YouTube)
"""
import yt_dlp
import requests
from pydeezer import DeezerClient as Deezer
from config import DEEZER_ARL
from config import ENTRY_MAPPING

def normalize_data(data: dict) -> dict:
    """Map input dictionary keys to a unified structure."""
    return {ENTRY_MAPPING.get(k, k): v for k, v in data.items()}

def search_deezer(query: str, limit: int = 15) -> list[dict]:
    """
    Searches Deezer using the private API with ARL authentication.
    Returns full tracks (not 30-second previews like the public API).
    """
    try:
        url = "https://api.deezer.com/search"
        params = {"q": query, "limit": limit}
        headers = {"Cookie": f"arl={DEEZER_ARL}"}

        response = requests.get(url, params=params, headers=headers)
        data = response.json()

        results = []
        for item in data.get("data", [])[:limit]:
            results.append({
                "source":   "deezer",
                "title":    item.get("title", "Unknown Title"),
                "artist":   item.get("artist", {}).get("name", "Unknown Artist"),
                "duration": item.get("duration", 0),
                "id":       str(item.get("id")),
                "thumb":    item.get("album", {}).get("cover_medium", ""),
            })

        return results

    except Exception as e:
        # Silently fail and return empty list
        return []


def search_youtube(query: str, limit: int = 15) -> list[dict]:
    opts = {
        "quiet": True,
        "extract_flat": True,
        "remote_components": ["ejs:github"],
        "js_runtimes": {
            "node": {
                "path": r"D:\nodejs"
            }
        },
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }

    formatted_results = []
    search_query = f"ytsearch{limit}:{query}"

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
            entries = info.get("entries", [])
            entries_list = list(entries)

        for entry in entries_list:
            track_info = {
                "title": entry.get("title", "Unknown Title"),
                "artist": entry.get("uploader", "Unknown Artist"),
                "duration": int(entry.get("duration") or 0),
                "source": "youtube",
                "id": entry.get("id", ""),
                "thumb": entry.get("thumbnails", [{}])[0].get("url", "") if entry.get("thumbnails") else ""
            }
            formatted_results.append(track_info)

        return formatted_results

    except Exception as e:
        # Silently fail and return whatever formatted results we managed to get (if any)
        return formatted_results


def search_both(query: str, limit: int = 10) -> list[dict]:
    deezer_results  = search_deezer(query, limit=limit)
    youtube_results = search_youtube(query, limit=limit)
    return deezer_results + youtube_results