from ytmusicapi import YTMusic

# ── Singleton: reuse the YTMusic instance across calls ─────────────────────────
# Creating a fresh YTMusic() on every request triggers auth token exhaustion
# and re-authentication on each call. One instance = stable session.
_ytmusic_instance = None

def _get_ytmusic():
    global _ytmusic_instance
    if _ytmusic_instance is None:
        _ytmusic_instance = YTMusic()
    return _ytmusic_instance


def get_similar_tracks(query: str) -> dict:
    try:
        ytmusic = _get_ytmusic()

        # 1. Try strict song search first
        search_results = ytmusic.search(query, filter="songs", limit=1)

        # 2. If strict search fails, try a general search
        if not search_results:
            search_results = ytmusic.search(query, limit=1)

        if not search_results:
            return {"success": False, "error": "Could not find the track to start a radio."}

        # 3. Safely grab the video ID
        target_video_id = search_results[0].get('videoId')
        if not target_video_id:
            return {"success": False, "error": "Found a result, but it wasn't a playable song."}

        # 4. Trigger YouTube's "Start Radio"
        radio = ytmusic.get_watch_playlist(videoId=target_video_id, limit=16)

        suggestions = []
        for track in radio['tracks'][1:16]:
            artist = track['artists'][0]['name'] if track.get('artists') else "Unknown"
            title = track['title']
            suggestions.append(f"{artist} - {title}")

        formatted_string = " | ".join(suggestions)

        # Successfully returning the data, completely silently!
        return {"success": True, "data": formatted_string}

    except Exception as e:
        # Silently passing the error to the UI without printing it
        return {"success": False, "error": str(e)}