import os, sys

if getattr(sys, 'frozen', False):
    # 1. Security certs stay in the temporary PyInstaller folder
    os.environ['SSL_CERT_FILE'] = os.path.join(sys._MEIPASS, 'certifi', 'cacert.pem')
    os.environ['REQUESTS_CA_BUNDLE'] = os.environ['SSL_CERT_FILE']

    # 2. THE FIX: Permanent data saves to the 'resources' folder!
    # sys.executable is resources/backend/server.exe, so we go up two folders
    BASE_DIR = os.path.dirname(os.path.dirname(sys.executable))
else:
    # Dev mode
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 3. THE MAGIC TRICK: Force Python to treat BASE_DIR as its main folder.
# This makes library.py and playlists.py save to the right place instantly!
os.environ['APP_DATA_DIR'] = os.path.join(BASE_DIR, 'data')
os.chdir(BASE_DIR)

import copy
import uuid
# ... rest of your imports

from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import requests

from core import search, downloader, library, ai_suggest, trimmer, playlists

app = Flask(__name__)
CORS(app)


# ── search ────────────────────────────────────────────────────────────────────
@app.route('/api/search', methods=['POST'])
def api_search():
    try:
        # Safely grab the data
        data   = request.get_json(force=True, silent=True) or {}
        source = data.get('source')
        query  = data.get('query')

        if not query:
            return jsonify([]) # Return empty list if no query

        if source == 'youtube':
            results = search.search_youtube(query)
        elif source == 'deezer':
            results = search.search_deezer(query)
        else:
            results = search.search_both(query)

        return jsonify(results)

    except Exception as e:
        # If it crashes, return a SAFE JSON error instead of an HTML page!
        # We strip special characters from the error message just in case to prevent double-crashes
        safe_error = str(e).encode('ascii', 'ignore').decode('ascii')
        return jsonify([{"title": " Error", "artist": f"Search failed: {safe_error}", "source": "error"}]), 500


# ── download ──────────────────────────────────────────────────────────────────
@app.route('/api/download', methods=['POST'])
def api_download():
    track      = request.json
    target_url = track.get('webpage_url') or track.get('url') or track.get('link')

    if track.get('source') == 'deezer' and track.get('id'):
        target_url = f"https://www.deezer.com/track/{track['id']}"
    elif track.get('source') == 'youtube' and not target_url and track.get('id'):
        target_url = f"https://www.youtube.com/watch?v={track['id']}"

    track['url'] = target_url

    try:
        filepath = downloader.download_track(track)
        if filepath:
            tracks = library.load_library()
            library.add_track(tracks, track, filepath)
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Downloader returned None"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── preview ───────────────────────────────────────────────────────────────────
@app.route('/api/preview', methods=['POST'])
def api_preview():
    track  = request.json
    source = track.get('source')

    # Deezer native 30-second preview (no yt-dlp needed)
    if source == 'deezer' and track.get('id'):
        try:
            dz_data = requests.get(f"https://api.deezer.com/track/{track['id']}").json()
            if dz_data.get('preview'):
                return jsonify({"stream_url": dz_data['preview']})
            return jsonify({"error": "No free preview available"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # YouTube preview via yt-dlp
    target_url = track.get('webpage_url') or track.get('url') or track.get('link')
    if not target_url and track.get('id'):
        target_url = f"https://www.youtube.com/watch?v={track['id']}"
    if not target_url:
        return jsonify({"error": "No valid URL to preview"}), 400

    ydl_opts = {
        'format': 'm4a/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {'youtube': ['player_client=android']},
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            return jsonify({"stream_url": info['url']})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── delete ────────────────────────────────────────────────────────────────────
@app.route('/api/delete', methods=['POST'])
def api_delete():
    data     = request.json
    # Accept either a full track object (with file_path inside)
    # or a flat payload that just has file_path directly.
    filepath = data.get('file_path') or (data.get('track', {}).get('file_path') if isinstance(data.get('track'), dict) else None)

    tracks = library.load_library()
    library.remove_track(tracks, filepath)

    # Cascade: remove from all playlists
    all_playlists = playlists.load_playlists()
    for p in all_playlists:
        p['tracks'] = [t for t in p['tracks'] if t.get('file_path') != filepath]
    playlists.save_playlists(all_playlists)

    try:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── library ───────────────────────────────────────────────────────────────────
@app.route('/api/library', methods=['GET'])
def api_library():
    return jsonify(library.load_library())


# ── AI suggest ────────────────────────────────────────────────────────────────
@app.route('/api/suggest', methods=['POST'])
def api_suggest():
    try:
        # 1. Safely grab the data. "force=True" ignores broken headers,
        # "silent=True" prevents Flask from crashing if the body is empty!
        data = request.get_json(force=True, silent=True) or {}
        query = data.get('query')

        if not query:
            return jsonify({"success": False, "error": "No query provided"}), 400

        # 2. Run the AI suggestion
        result = ai_suggest.get_similar_tracks(query)

        # 3. Safely check for success using .get() just in case the dictionary is weird
        if result.get("success"):
            return jsonify(result)
        else:
            return jsonify(result), 500

    except Exception as e:
        # 4. If EVERYTHING fails, we force the error into JSON format
        # so you can actually read the crash log in the UI!
        import traceback
        error_trace = traceback.format_exc()
        print(f"\n[CRITICAL Flask Error]:\n{error_trace}\n")
        return jsonify({"success": False, "error": f"Server crash: {str(e)}"}), 500
# ── trim ──────────────────────────────────────────────────────────────────────
@app.route('/api/trim', methods=['POST'])
def api_trim():
    try:
        data       = request.json
        track_data = data.get('track')
        start_time = data.get('start_time')
        end_time   = data.get('end_time')

        if not track_data or start_time is None or end_time is None:
            return jsonify({"success": False, "error": "Missing trim parameters."}), 400

        filepath = track_data.get('file_path') or track_data.get('filepath')
        result   = trimmer.slice_audio(filepath, float(start_time), float(end_time))

        if not result.get("success"):
            return jsonify({"success": False, "error": result.get("error", "Trim failed")}), 400

        new_track             = copy.deepcopy(track_data)
        new_track["title"]    = f"{new_track['title']} (Trimmed)"
        new_track["file_path"] = result["new_filepath"]
        new_track["id"]       = f"{new_track.get('id', 'trim')}_trimmed_{int(float(start_time))}"

        tracks = library.load_library()
        library.add_track(tracks, new_track, result["new_filepath"])

        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": f"Python crashed: {str(e)}"})


# ── rename ────────────────────────────────────────────────────────────────────
@app.route('/api/rename', methods=['POST'])
def api_rename():
    data       = request.json
    filepath   = data.get('file_path')
    new_title  = data.get('new_title')
    new_artist = data.get('new_artist')

    tracks = library.load_library()
    for t in tracks:
        if t.get('file_path') == filepath:
            t['title']  = new_title
            t['artist'] = new_artist
    library.save_library(tracks)

    all_playlists = playlists.load_playlists()
    for p in all_playlists:
        for t in p['tracks']:
            if t.get('file_path') == filepath:
                t['title']  = new_title
                t['artist'] = new_artist
    playlists.save_playlists(all_playlists)

    return jsonify({"success": True})


# ── playlists ─────────────────────────────────────────────────────────────────
@app.route('/api/playlists', methods=['GET'])
def api_get_playlists():
    return jsonify(playlists.load_playlists())


@app.route('/api/playlists/create', methods=['POST'])
def api_create_playlist():
    data          = request.json
    all_playlists = playlists.load_playlists()
    all_playlists.append({
        "id":     str(uuid.uuid4()),
        "name":   data.get('name'),
        "icon":   data.get('icon', ''),
        "tracks": [],
    })
    playlists.save_playlists(all_playlists)
    return jsonify({"success": True})


@app.route('/api/playlists/edit', methods=['POST'])
def api_edit_playlist():
    data          = request.json
    playlist_id   = data.get('playlist_id')
    all_playlists = playlists.load_playlists()
    for p in all_playlists:
        if p['id'] == playlist_id:
            if data.get('name'):     p['name'] = data['name']
            if data.get('icon') is not None: p['icon'] = data['icon']
            break
    playlists.save_playlists(all_playlists)
    return jsonify({"success": True})


@app.route('/api/playlists/add', methods=['POST'])
def api_add_to_playlist():
    data        = request.json
    playlist_id = data.get('playlist_id')
    track       = data.get('track')
    if not playlist_id or not track:
        return jsonify({"success": False, "error": "Missing data"}), 400
    playlists.add_track(playlist_id, track)
    return jsonify({"success": True})


@app.route('/api/playlists/remove', methods=['POST'])
def api_remove_from_playlist():
    data          = request.json
    playlist_id   = data.get('playlist_id')
    filepath      = data.get('file_path')
    all_playlists = playlists.load_playlists()
    for p in all_playlists:
        if p['id'] == playlist_id:
            p['tracks'] = [t for t in p['tracks'] if t.get('file_path') != filepath]
            break
    playlists.save_playlists(all_playlists)
    return jsonify({"success": True})


@app.route('/api/playlists/delete', methods=['POST'])
def api_delete_playlist():
    data          = request.json
    playlist_id   = data.get('playlist_id')
    all_playlists = playlists.load_playlists()
    all_playlists = [p for p in all_playlists if p['id'] != playlist_id]
    playlists.save_playlists(all_playlists)
    return jsonify({"success": True})


# ── icons ─────────────────────────────────────────────────────────────────────
@app.route('/api/icons', methods=['GET'])
def api_get_icons():
    # 1. Path Intelligence: Where are we?
    if getattr(sys, 'frozen', False):
        # We are inside the .exe! server.exe is inside 'resources/backend'
        # We need to go up one level to 'resources', then into 'data'
        real_base = os.path.dirname(os.path.dirname(sys.executable))
    else:
        # We are in PyCharm, just use your normal BASE_DIR
        real_base = BASE_DIR

    icon_dir = os.path.join(real_base, 'data', 'icons', 'playlist_icons')
    os.makedirs(icon_dir, exist_ok=True)

    # 2. Return CLEAN, relative paths so the JS frontend can safely load them
    icons = []
    for f in os.listdir(icon_dir):
        if f.endswith('.png'):
            # We send exactly this so your renderer.js getSafePath() works perfectly
            icons.append(f"data/icons/playlist_icons/{f}")

    return jsonify(icons)


# ── run ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("Python Bridge Server is running on port 5000!")
    app.run(port=5000, threaded=True)
