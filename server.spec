# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
import os

SITE_PKGS = r'C:\Users\User\AppData\Local\Programs\Python\Python310\lib\site-packages'

datas = []
binaries = []
hiddenimports = []

# ── Manually add Flask and its dependencies as data files ─────────────────────
# collect_data_files silently skips these, so we add them manually
flask_deps = ['flask', 'werkzeug', 'jinja2', 'click', 'markupsafe',
              'itsdangerous', 'blinker', 'flask_cors']
for pkg in flask_deps:
    src = os.path.join(SITE_PKGS, pkg)
    if os.path.exists(src):
        datas.append((src, pkg))

# Other packages (collect_data_files works for these)
from PyInstaller.utils.hooks import collect_data_files
other_pkgs = ['certifi', 'charset_normalizer', 'idna', 'urllib3',
              'pydeezer', 'pycryptodome', 'websocket_client', 'mutagen',
              'ytmusicapi', 'yt_dlp', 'requests']
for pkg in other_pkgs:
    try:
        for src, dst in collect_data_files(pkg):
            datas.append((src, dst))
    except Exception:
        pass

# Collect submodules for packages that support it
all_pkgs = (flask_deps + other_pkgs)
for pkg in all_pkgs:
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception:
        pass

# ── Explicit hidden imports PyInstaller can't detect ──────────────────────────
hiddenimports += [
    'core.search', 'core.downloader', 'core.library',
    'core.ai_suggest', 'core.trimmer', 'core.playlists',
    'config',
    'flask', 'flask.Flask', 'flask_cors',
    'werkzeug', 'werkzeug.serving', 'werkzeug.utils', 'werkzeug.wrappers',
    'jinja2', 'jinja2.Environment', 'jinja2.loaders',
    'click', 'click.Command',
    'yt_dlp', 'yt_dlp.YoutubeDL',
    'yt_dlp.postprocessor', 'yt_dlp.postprocessor.common',
    'yt_dlp.postprocessor.ffmpeg', 'yt_dlp.extractor', 'yt_dlp.extractor.youtube',
    'yt_dlp.downloader', 'yt_dlp.downloader.http', 'yt_dlp.downloader.fragment',
    'pydeezer', 'pydeezer.Deezer',
    'requests', 'requests.sessions', 'requests.api',
    'certifi', 'charset_normalizer', 'idna', 'urllib3', 'urllib3.util',
    'pycryptodome', 'pycryptodome.Cipher', 'pycryptodome.Protocol',
    'websocket_client', 'websocket',
]

# Bundle core/ and config.py
datas.append((os.path.join(os.getcwd(), 'core'), 'core'))
datas.append((os.path.join(os.getcwd(), 'config.py'), 'config.py'))


a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'PIL'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)