import subprocess
import os


def slice_audio(input_filepath: str, start_sec: float, end_sec: float) -> dict:
    """
    Surgically slices an audio file from start_sec to end_sec.
    """
    print(f"\n[FFmpeg] Preparing to slice: {os.path.basename(input_filepath)}", flush=True)

    if not os.path.exists(input_filepath):
        return {"success": False, "error": f"Cannot find file: {input_filepath}"}

    # --- THE BULLETPROOF FILENAME GENERATOR ---
    clean_path = input_filepath.strip()
    base_name, extension = os.path.splitext(clean_path)

    # 1. Strip any illegal trailing dots or spaces from the base name
    base_name = base_name.rstrip('. ')

    # 2. If the song was downloaded WITHOUT an extension, FORCE it to be .m4a!
    if not extension or extension == '.':
        extension = '.m4a'

    output_filepath = f"{base_name} (Trimmed){extension}"
    # ------------------------------------------

    command = [
        "ffmpeg",
        "-y",
        "-i", clean_path,
        "-ss", str(start_sec),
        "-to", str(end_sec),
        "-c", "copy",
        output_filepath
    ]

    try:
        print(f"[FFmpeg] Slicing from {start_sec}s to {end_sec}s...", flush=True)

        result = subprocess.run(command, check=True, capture_output=True, text=True)

        print(f"[FFmpeg] Success! Saved to: {output_filepath}\n", flush=True)
        return {"success": True, "new_filepath": output_filepath}

    except subprocess.CalledProcessError as e:
        err_log = e.stderr if e.stderr else e.stdout
        if not err_log:
            err_log = "Unknown FFmpeg crash (No logs generated)."

        print(f"\n❌ [FFmpeg Crash]:\n{err_log}", flush=True)
        short_error = err_log.strip()[-150:]
        return {"success": False, "error": f"FFmpeg: ...{short_error}"}

    except FileNotFoundError:
        print("\n❌ [FFmpeg PATH Error]: Python cannot find FFmpeg!", flush=True)
        return {"success": False, "error": "FFmpeg is missing from your system!"}