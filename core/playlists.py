import json
import os
import uuid


_data_dir      = os.environ.get('APP_DATA_DIR', os.path.join(os.path.dirname(__file__), '..', 'data'))
PLAYLIST_FILE = os.path.join(_data_dir, 'playlists.json')

def load_playlists():
    if not os.path.exists(PLAYLIST_FILE):
        return []
    try:
        with open(PLAYLIST_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def save_playlists(playlists):
    os.makedirs(os.path.dirname(PLAYLIST_FILE), exist_ok=True)
    with open(PLAYLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(playlists, f, indent=4, ensure_ascii=False)

def create_playlist(name):
    playlists = load_playlists()
    new_playlist = {
        "id": str(uuid.uuid4()), # Generates a unique secure ID
        "name": name,
        "tracks": []
    }
    playlists.append(new_playlist)
    save_playlists(playlists)
    return new_playlist

def add_track(playlist_id, track):
    playlists = load_playlists()
    for p in playlists:
        if p['id'] == playlist_id:
            # Prevent duplicate songs in the same playlist
            if not any(t.get('file_path') == track.get('file_path') for t in p['tracks']):
                p['tracks'].append(track)
            break
    save_playlists(playlists)
    return playlists