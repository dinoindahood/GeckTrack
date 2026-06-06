"""
library.py — manages your local music collection

HOW IT WORKS:
  Your library is stored as a single JSON file: data/library.json
  It holds a list of track entries. Each entry is the result dict
  from search.py plus the local file path added after download.

  The library is loaded into memory when the app starts,
  and saved back to disk every time something changes.
  This is fast and simple — no database needed for a personal collection.

LIBRARY ENTRY FORMAT:
  {
    "title":     "Bohemian Rhapsody",
    "artist":    "Queen",
    "duration":  354,
    "source":    "deezer",
    "id":        "123456",
    "thumb":     "https://...",
    "file_path": "/downloads/Queen_-_Bohemian_Rhapsody.mp3",  ← added on download
    "added_at":  "2024-01-15T20:30:00",                       ← timestamp
    "playlists": ["favourites", "rock classics"],             ← playlist membership
  }

PLAYLISTS:
  Playlists are NOT separate objects — they're just string tags on each track.
  To get a playlist, you filter tracks by playlist name.
  To create a playlist, you just add a new tag name to a track.
  Simple, no extra data structures needed.
"""

import json
import os
from datetime import datetime

_data_dir    = os.environ.get('APP_DATA_DIR', os.path.join(os.path.dirname(__file__), '..', 'data'))
LIBRARY_PATH = os.path.join(_data_dir, 'library.json')


# ─── loading & saving ─────────────────────────────────────────────────────────

def load_library() -> list[dict]:
    """
    Load all tracks from disk into a Python list.

    HOW IT WORKS:
      Reads the JSON file and returns its contents.
      If the file doesn't exist yet (first run), returns an empty list.
      Call this once when the app starts — store the result in memory.
    """
    if not os.path.exists(LIBRARY_PATH):
        return []
    with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_library(tracks: list[dict]) -> None:
    """
    Save the current in-memory track list back to disk.

    HOW IT WORKS:
      Overwrites library.json with the current list.
      Call this every time you add, remove, or edit a track.
      indent=2 keeps the file human-readable (nice for debugging).
    """
    os.makedirs(os.path.dirname(LIBRARY_PATH), exist_ok=True)
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(tracks, f, indent=2, ensure_ascii=False)


# ─── track management ─────────────────────────────────────────────────────────

def add_track(tracks: list[dict], result: dict, file_path: str) -> list[dict]:
    """
    Add a downloaded track to the library.

    HOW IT WORKS:
      Takes the result dict from search.py and the local file path
      from downloader.py, merges them into one entry, appends it
      to the tracks list, and saves to disk.

    ARGS:
      tracks    — the current in-memory library list
      result    — search result dict (title, artist, source, etc.)
      file_path — where the file was saved on disk

    RETURNS: updated tracks list
    """
    # Check we don't already have this track (by file path)
    if any(t["file_path"] == file_path for t in tracks):
        print(f"[library] track already in library: {file_path}")
        return tracks

    entry = {
        **result,                          # spread all search result fields in
        "file_path": file_path,
        "added_at":  datetime.now().isoformat(),
        "playlists": [],
    }
    tracks.append(entry)
    save_library(tracks)
    print(f"[library] added: {entry['artist']} - {entry['title']}")
    return tracks


def remove_track(tracks: list[dict], file_path: str) -> list[dict]:
    """
    Remove a track from the library (and delete the audio file).

    HOW IT WORKS:
      Filters out the track with the matching file_path from the list,
      deletes the actual audio file from disk, then saves the library.

    NOTE:
      This permanently deletes the file. We could add a "trash" feature
      later, but for now it's a hard delete.
    """
    track = next((t for t in tracks if t["file_path"] == file_path), None)
    if not track:
        print(f"[library] track not found: {file_path}")
        return tracks

    # Delete the audio file
    if os.path.exists(file_path):
        os.remove(file_path)

    tracks = [t for t in tracks if t["file_path"] != file_path]
    save_library(tracks)
    print(f"[library] removed: {track.get('title', file_path)}")
    return tracks


# ─── search ───────────────────────────────────────────────────────────────────

def search_library(tracks: list[dict], query: str) -> list[dict]:
    """
    Search your local library by title or artist.

    HOW IT WORKS:
      Simple case-insensitive string matching on title + artist.
      No external API needed — everything is local.
      Fast enough for thousands of tracks.

    RETURNS: list of matching track entries
    """
    query = query.lower()
    return [
        t for t in tracks
        if query in t.get("title",  "").lower()
        or query in t.get("artist", "").lower()
    ]


# ─── playlists ────────────────────────────────────────────────────────────────

def get_playlists(tracks: list[dict]) -> list[str]:
    """
    Return a sorted list of all unique playlist names in the library.

    HOW IT WORKS:
      Collects all playlist tags across all tracks, deduplicates them.
    """
    names = set()
    for t in tracks:
        names.update(t.get("playlists", []))
    return sorted(names)


def get_playlist_tracks(tracks: list[dict], playlist_name: str) -> list[dict]:
    """
    Return all tracks that belong to a given playlist.
    """
    return [t for t in tracks if playlist_name in t.get("playlists", [])]


def add_to_playlist(tracks: list[dict], file_path: str, playlist_name: str) -> list[dict]:
    """
    Add a track to a playlist by name.
    Creates the playlist automatically if it doesn't exist yet.
    """
    for t in tracks:
        if t["file_path"] == file_path:
            if playlist_name not in t["playlists"]:
                t["playlists"].append(playlist_name)
                save_library(tracks)
            return tracks
    print(f"[library] track not found: {file_path}")
    return tracks


def remove_from_playlist(tracks: list[dict], file_path: str, playlist_name: str) -> list[dict]:
    """
    Remove a track from a playlist.
    Does NOT delete the track itself — just removes the tag.
    """
    for t in tracks:
        if t["file_path"] == file_path:
            t["playlists"] = [p for p in t["playlists"] if p != playlist_name]
            save_library(tracks)
            return tracks
    return tracks
