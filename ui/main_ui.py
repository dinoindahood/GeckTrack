import flet as ft
import threading

from core import search, downloader, library, player
from config import DEFAULT_VOLUME


def main(page: ft.Page):

    # ── page setup ────────────────────────────────────────────────────────────
    page.title       = "SUPER TOP PLAYER V2"
    page.theme_mode  = ft.ThemeMode.DARK
    page.padding     = 20
    page.window_width  = 900
    page.window_height = 700

    player.init()
    player.set_volume(DEFAULT_VOLUME)

    app_tracks = library.load_library()

    # ── shared status bar ─────────────────────────────────────────────────────
    status_text = ft.Text("Ready.", color=ft.colors.GREEN)

    def set_status(msg: str, color=ft.colors.GREEN):
        status_text.value = msg
        status_text.color = color
        page.update()

    # ── player bar ────────────────────────────────────────────────────────────
    now_playing_text = ft.Text("Nothing playing", weight="bold", size=16)
    time_current     = ft.Text("0:00", size=12)
    time_total       = ft.Text("0:00", size=12)
    progress_slider  = ft.Slider(min=0, max=100, value=0, expand=True)
    is_sliding       = [False]

    def update_player_display():
        track = player.get_current_track()
        now_playing_text.value = (
            f"{track.get('artist','?')} — {track.get('title','?')}"
            if track else "Nothing playing"
        )
        page.update()

    def toggle_play(e):
        if player.is_playing(): player.pause()
        else: player.play()
        update_player_display()

    def play_next(e):
        player.next_track()
        update_player_display()

    def play_prev(e):
        player.prev_track()
        update_player_display()

    def on_volume_change(e):
        player.set_volume(e.control.value / 100)

    def on_slider_change(e):
        is_sliding[0] = True

    def on_slider_release(e):
        is_sliding[0] = False
        track = player.get_current_track()
        if track:
            duration = track.get("duration", 1) or 1
            player.seek((progress_slider.value / 100) * duration)

    progress_slider.on_change     = on_slider_change
    progress_slider.on_change_end = on_slider_release

    # ── heartbeat thread ──────────────────────────────────────────────────────
    # Runs permanently in background. page.update() is thread-safe in Flet.
    # The is_sliding guard prevents the slider jumping while the user drags it.
    def player_heartbeat():
        import time
        while True:
            if player.is_playing() and not is_sliding[0]:
                track = player.get_current_track()
                if track:
                    pos      = player.get_position()
                    duration = track.get("duration", 1) or 1
                    progress_slider.value = (pos / duration) * 100
                    time_current.value    = f"{int(pos // 60)}:{int(pos % 60):02d}"
                    time_total.value      = f"{int(duration // 60)}:{int(duration % 60):02d}"
                    page.update()
            time.sleep(1)

    threading.Thread(target=player_heartbeat, daemon=True).start()

    player_bar = ft.Card(
        content=ft.Container(
            padding=15,
            content=ft.Column([
                now_playing_text,
                ft.Row([
                    ft.IconButton(ft.icons.SKIP_PREVIOUS, on_click=play_prev),
                    ft.IconButton(ft.icons.PLAY_ARROW,    on_click=toggle_play),
                    ft.IconButton(ft.icons.SKIP_NEXT,     on_click=play_next),
                    time_current,
                    progress_slider,
                    time_total,
                    ft.Icon(ft.icons.VOLUME_UP),
                    ft.Slider(
                        min=0, max=100,
                        value=DEFAULT_VOLUME * 100,
                        width=100,
                        on_change=on_volume_change,
                    ),
                ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
            ])
        )
    )

    # ── library tab ───────────────────────────────────────────────────────────
    library_list = ft.ListView(expand=True, spacing=6)

    def refresh_library_ui():
        library_list.controls.clear()
        for i, track in enumerate(app_tracks):
            mins, secs   = divmod(track.get("duration", 0), 60)
            display_text = (
                f"{track.get('artist','?')} — {track.get('title','?')}  "
                f"({mins}:{secs:02d})"
            )

            # FIX: capture loop variables with default args.
            # Without default args every closure captures the SAME variable
            # (last value of the loop). Default args bind at definition time.
            def make_play(idx=i):
                def click(e):
                    player.set_queue(app_tracks, start_index=idx)
                    update_player_display()
                return click

            def make_delete(t=track):
                def click(e):
                    updated = library.remove_track(list(app_tracks), t.get("file_path",""))
                    app_tracks.clear()
                    app_tracks.extend(updated)
                    refresh_library_ui()
                    set_status(f"Deleted: {t.get('title','?')}", ft.colors.ORANGE)
                return click

            library_list.controls.append(
                ft.Row([
                    ft.IconButton(ft.icons.PLAY_ARROW, icon_color=ft.colors.GREEN,   on_click=make_play()),
                    ft.IconButton(ft.icons.DELETE,     icon_color=ft.colors.RED_400, on_click=make_delete()),
                    ft.Text(display_text, size=15),
                ])
            )
        page.update()

    library_tab_content = ft.Column(
        [
            ft.Text("Your Music", size=20, weight="bold"),
            library_list,
        ],
        expand=True,  # FIX: ListView collapses to zero without this
    )

    # ── search tab ────────────────────────────────────────────────────────────
    search_input        = ft.TextField(label="Search for a song...", expand=True)
    search_results_list = ft.ListView(expand=True, spacing=6)

    def run_search(source: str):
        query = search_input.value.strip()
        if not query:
            return

        set_status(f"Searching '{query}'…", ft.colors.BLUE)
        search_results_list.controls.clear()
        page.update()

        # FIX: run in a background thread.
        # Search (especially YouTube via yt-dlp) takes 1-3 seconds.
        # Without threading the entire window freezes until it returns.
        def _do_search():
            if source == "youtube":
                results = search.search_youtube(query)
            elif source == "deezer":
                results = search.search_deezer(query)
            else:
                results = search.search_both(query)

            search_results_list.controls.clear()

            if not results:
                search_results_list.controls.append(ft.Text("No results found."))
                set_status("No results found.", ft.colors.ORANGE)
                return

            for track in results:
                mins, secs   = divmod(track.get("duration", 0), 60)
                source_tag   = "[D]" if track["source"] == "deezer" else "[YT]"
                display_text = (
                    f"{source_tag}  {track.get('artist','?')} — "
                    f"{track.get('title','?')}  ({mins}:{secs:02d})"
                )

                # FIX: same loop-capture issue — use default arg
                def make_download(t=track):
                    def click(e):
                        # FIX: download in a thread.
                        # YouTube download + ffmpeg conversion = 10-30 seconds.
                        # Running on the click handler would freeze the whole UI.
                        def _do_download():
                            set_status(f"Downloading '{t.get('title','?')}'…", ft.colors.BLUE)
                            filepath = downloader.download_track(t)
                            if filepath:
                                updated = library.add_track(list(app_tracks), t, filepath)
                                app_tracks.clear()
                                app_tracks.extend(updated)
                                refresh_library_ui()
                                set_status(f"✓ Saved: {t.get('title','?')}", ft.colors.GREEN)
                            else:
                                set_status("Download failed — check console.", ft.colors.RED)
                        threading.Thread(target=_do_download, daemon=True).start()
                    return click

                search_results_list.controls.append(
                    ft.Row([
                        ft.IconButton(ft.icons.DOWNLOAD, tooltip="Download", on_click=make_download()),
                        ft.Text(display_text, size=15),
                    ])
                )

            set_status(f"Found {len(results)} results.", ft.colors.GREEN)
            page.update()

        threading.Thread(target=_do_search, daemon=True).start()

    search_input.on_submit = lambda e: run_search("both")

    search_tab_content = ft.Column(
        [
            ft.Row([
                search_input,
                ft.ElevatedButton("Search YouTube", on_click=lambda e: run_search("youtube")),
                ft.ElevatedButton("Search Deezer",  on_click=lambda e: run_search("deezer")),
            ]),
            search_results_list,
        ],
        expand=True,  # FIX: same as library
    )

    # ── assemble ──────────────────────────────────────────────────────────────
    page.add(
        ft.Text("SUPER TOP PLAYER BY IVANKA", size=24, weight="bold"),
        status_text,
        ft.Tabs(
            selected_index=0,
            expand=1,   # FIX: must be int 1, not True — Flet uses this as a flex grow value
            tabs=[
                ft.Tab(
                    text="Search",
                    content=ft.Container(content=search_tab_content, padding=10, expand=True),
                ),
                ft.Tab(
                    text="Library",
                    content=ft.Container(content=library_tab_content, padding=10, expand=True),
                ),
            ],
        ),
        player_bar,
    )

    refresh_library_ui()


ft.app(target=main)