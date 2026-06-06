const { ipcRenderer } = require('electron');
const path = require('path'); // Added for path math

// --- 🛠️ THE PATH INTELLIGENCE (THE FIX) ---
// This detects if we are running in PyCharm or as an installed .exe
const isPackaged = !process.execPath.includes('node_modules');

// downloads/ lives next to the exe in both modes:
//   Dev:      musicapp/downloads/
//   Packaged: win-unpacked/downloads/
const downloadsPath = isPackaged
  ? path.join(path.dirname(process.resourcesPath), 'downloads')
  : path.join(__dirname, '..', 'downloads');

// data/ (icons, etc.) lives inside resources/ in packaged mode:
//   Dev:      musicapp/data/
//   Packaged: win-unpacked/resources/data/
const dataPath = isPackaged
  ? path.join(process.resourcesPath, 'data')
  : path.join(__dirname, '..', 'data');

/**
 * Converts a file path into a file:// URL the renderer can load.
 * - Absolute paths (C:\...) are converted directly — no prefix.
 * - Relative paths: icons use dataPath, audio uses downloadsPath.
 *   Pass 'icons' as the second arg for icon paths.
 */
function getSafePath(originalPath, type = 'audio') {
    if (!originalPath) return '';
    // Absolute Windows path — normalize to forward slashes, no prefix
    if (originalPath.match(/^[A-Z]:[\\\/]/i)) {
        return `file:///${originalPath.replace(/\\/g, '/')}`;
    }
    let base = type === 'icons' ? dataPath : downloadsPath;
    // Server returns paths like "data/icons/..." — strip the "data/" prefix
    // so we don't end up with dataPath + "data/icons/..." = double "data/"
    const normalized = originalPath.replace(/^data[\\\/]/i, '');
    const fullPath = path.join(base, normalized).replace(/\\/g, '/');
    return `file:///${fullPath}`;
}

// --- UI ELEMENTS ---
const tabSearch = document.getElementById('tab-search');
const tabLibrary = document.getElementById('tab-library');
const screenSearch = document.getElementById('screen-search');
const screenLibrary = document.getElementById('screen-library');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const libraryResults = document.getElementById('library-results');
const btnRefresh = document.getElementById('btn-refresh');
const aiSuggestionsBox = document.getElementById('ai-suggestions');
const librarySearchInput = document.getElementById('library-search-input');
const playerMenuContainer = document.getElementById('player-menu-container');
const btnPlayerMenu = document.getElementById('btn-player-menu');
const playerDropdown = document.getElementById('player-dropdown');
const playerOptAdd = document.getElementById('player-opt-add');
const playerOptTrim = document.getElementById('player-opt-trim');
const playerOptDel = document.getElementById('player-opt-del');
const renameModal = document.getElementById('rename-modal');
const renameArtistInput = document.getElementById('rename-artist-input');
const renameTitleInput = document.getElementById('rename-title-input');
const playerOptRename = document.getElementById('player-opt-rename');
const editPlaylistModal = document.getElementById('edit-playlist-modal');
const editPlaylistInput = document.getElementById('edit-playlist-input');
const createIconGallery = document.getElementById('create-icon-gallery');
const editIconGallery = document.getElementById('edit-icon-gallery');

const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');
const btnBulkRemove = document.getElementById('btn-bulk-remove');

// Modals
const trimModal = document.getElementById('trim-modal');
const trimTrackName = document.getElementById('trim-track-name');
const trimStart = document.getElementById('trim-start');
const trimEnd = document.getElementById('trim-end');
const trimStatus = document.getElementById('trim-status');
const trimAudioPlayer = document.getElementById('trim-audio-player');
const trimStartDisplay = document.getElementById('trim-start-display');
const trimEndDisplay = document.getElementById('trim-end-display');
const btnPreviewTrim = document.getElementById('btn-preview-trim');

const createPlaylistModal = document.getElementById('create-playlist-modal');
const newPlaylistInput = document.getElementById('new-playlist-input');
const playlistModal = document.getElementById('playlist-modal');
const playlistTrackName = document.getElementById('playlist-track-name');
const playlistSelect = document.getElementById('playlist-select');
const playlistStatus = document.getElementById('playlist-status');

// Navigation & Player Elements
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const audio = document.getElementById('audio-player');
const playBtn = document.getElementById('play-pause-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeText = document.getElementById('current-time');
const totalTimeText = document.getElementById('total-time');
const trackTitleText = document.getElementById('track-title');
const btnMagicSuggest = document.getElementById('btn-magic-suggest');
const shuffleBtn = document.getElementById('shuffle-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

// State Variables
let availableIcons = [];
let selectedCreateIcon = null;
let selectedEditIcon = null;
let playlistToEdit = null;
let selectedTracks = new Set();
let allPlaylists = [];
let currentPlaylistView = null;
const playlistList = document.getElementById('playlist-list');
const libraryViewTitle = document.getElementById('library-view-title');
let trackToAddToPlaylist = null;


// --- CUSTOM CONFIRM MODAL LOGIC ---
function showConfirm(title, message, onConfirmCallback) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-message').innerText = message;

  const btnOk = document.getElementById('btn-ok-confirm');
  const btnCancel = document.getElementById('btn-cancel-confirm');

  const newBtnOk = btnOk.cloneNode(true);
  btnOk.parentNode.replaceChild(newBtnOk, btnOk);

  newBtnOk.onclick = () => {
    modal.style.display = 'none';
    onConfirmCallback();
  };

  btnCancel.onclick = () => {
    modal.style.display = 'none';
  };

  modal.style.display = 'flex';
}

// --- TAB SWITCHING ---
tabSearch.addEventListener('click', () => {
  tabSearch.classList.add('active'); tabLibrary.classList.remove('active');
  screenSearch.classList.add('active'); screenLibrary.classList.remove('active');
});

tabLibrary.addEventListener('click', () => {
  tabLibrary.classList.add('active'); tabSearch.classList.remove('active');
  screenLibrary.classList.add('active'); screenSearch.classList.remove('active');
  loadLibrary();
});

// --- LIBRARY SEARCH LOGIC ---
let librarySearchTimeout;
librarySearchInput.addEventListener('input', () => {
  clearTimeout(librarySearchTimeout);
  librarySearchTimeout = setTimeout(loadLibrary, 200);
});
btnRefresh.addEventListener('click', loadLibrary);

// --- 🔊 GECKTRACK AUTO-LEVELER & WINDOWS CONTROLS ---
let audioCtx, trackSource, compressor;

function setupAudioEngine() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  trackSource = audioCtx.createMediaElementSource(audio);
  compressor = audioCtx.createDynamicsCompressor();

  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  trackSource.connect(compressor);
  compressor.connect(audioCtx.destination);
}

function updateWindowsMediaOverlay(trackTitle, trackArtist) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle,
      artist: trackArtist,
      album: 'GeckTrack'
    });

    navigator.mediaSession.setActionHandler('play', () => { audio.play(); playBtn.innerText = '⏸ Pause'; });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); playBtn.innerText = '▶ Play'; });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }
}

// --- AUDIO PLAYER UI LOGIC ---
playBtn.addEventListener('click', () => {
  if (audio.paused) { audio.play(); playBtn.innerText = '⏸ Pause'; }
  else { audio.pause(); playBtn.innerText = '▶ Play'; }
});

audio.addEventListener('timeupdate', () => {
  const pct = (audio.currentTime / audio.duration) * 100 || 0;
  progressBar.value = pct;
  progressBar.style.setProperty('--progress-pct', `${pct}%`);
  let mins = Math.floor(audio.currentTime / 60);
  let secs = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
  currentTimeText.innerText = `${mins}:${secs}`;
});

audio.addEventListener('loadedmetadata', () => {
  let mins = Math.floor(audio.duration / 60);
  let secs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
  totalTimeText.innerText = `${mins}:${secs}`;
});

progressBar.addEventListener('input', () => {
  audio.currentTime = (progressBar.value / 100) * audio.duration;
  progressBar.style.setProperty('--progress-pct', `${progressBar.value}%`);
});

// --- THE THUMBAR SYNC LOGIC ---
audio.addEventListener('play', () => {
  ipcRenderer.send('update-thumbar', true);
});

audio.addEventListener('pause', () => {
  ipcRenderer.send('update-thumbar', false);
});

ipcRenderer.on('thumbar-command', (event, command) => {
  if (command === 'play') { audio.play(); playBtn.innerText = '⏸ Pause'; }
  if (command === 'pause') { audio.pause(); playBtn.innerText = '▶ Play'; }
  if (command === 'prev') playPrev();
  if (command === 'next') playNext();
});

// --- PLAYER STATE & QUEUE ---
let queue = [];
let queueIndex = 0;
let isShuffle = false;
let activePreviewBtn = null;
let isPlayingPreview = false;
let activeRow = null;
let currentPlayingFilePath = null;

function resetActiveUI() {
  if (activeRow) activeRow.classList.remove('active-row');
  if (activePreviewBtn) {
    activePreviewBtn.innerText = activePreviewBtn.hasAttribute('data-is-library') ? '▶' : '▶ Preview';
    activePreviewBtn.style.color = '';
  }
}

function playQueueTrack(index) {
  playerMenuContainer.style.display = 'inline-block';
  if (queue.length === 0) return;
  queueIndex = index;
  const track = queue[queueIndex];
  isPlayingPreview = false;

  resetActiveUI();
  if (track.domElement) {
    activeRow = track.domElement;
    activeRow.classList.add('active-row');
  }
  if (track.playBtnElement) {
    activePreviewBtn = track.playBtnElement;
    activePreviewBtn.innerText = '🔊';
    activePreviewBtn.style.color = '#1db954';
  }

  currentPlayingFilePath = track.file_path;
  progressBar.value = 0;
  progressBar.style.setProperty('--progress-pct', '0%');
  currentTimeText.innerText = '0:00';
  totalTimeText.innerText = '0:00';

  audio.src = getSafePath(track.file_path);
  setupAudioEngine();
  audio.play();
  btnMagicSuggest.style.display = 'inline-flex';

  let displayTitle = track.source === 'youtube' ? track.title : track.title;
  let displayArtist = track.source === 'youtube' ? 'YouTube Audio' : track.artist;

  trackTitleText.innerText = track.source === 'youtube' ? track.title : `${track.artist} — ${track.title}`;
  playBtn.innerText = '⏸ Pause';

  updateWindowsMediaOverlay(displayTitle, displayArtist);
}

function playNext() {
  if (queue.length === 0) return;
  if (isShuffle) {
    let nextIndex;
    do { nextIndex = Math.floor(Math.random() * queue.length); }
    while (nextIndex === queueIndex && queue.length > 1);
    queueIndex = nextIndex;
  } else {
    queueIndex = (queueIndex + 1) % queue.length;
  }
  playQueueTrack(queueIndex);
}

function playPrev() {
  if (queue.length === 0) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; }
  else {
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    playQueueTrack(queueIndex);
  }
}

shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  if (isShuffle) {
    shuffleBtn.classList.add('active');
  } else {
    shuffleBtn.classList.remove('active');
  }
});

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);
audio.addEventListener('ended', () => {
  if (!isPlayingPreview) playNext();
  else playBtn.innerText = '▶ Play';
});

// --- SEARCH HISTORY STATE ---
let searchHistory = [];
let forwardHistory = [];
let currentSearch = null;

function updateHistoryButtons() {
  btnBack.disabled = searchHistory.length === 0;
  btnBack.style.color = searchHistory.length === 0 ? '#555' : 'white';
  btnBack.style.cursor = searchHistory.length === 0 ? 'not-allowed' : 'pointer';

  btnForward.disabled = forwardHistory.length === 0;
  btnForward.style.color = forwardHistory.length === 0 ? '#555' : 'white';
  btnForward.style.cursor = forwardHistory.length === 0 ? 'not-allowed' : 'pointer';
}

btnBack.onclick = () => {
  if (searchHistory.length === 0) return;
  if (currentSearch) forwardHistory.push(currentSearch);
  currentSearch = searchHistory.pop();
  searchInput.value = currentSearch.query;
  runSearch(currentSearch.source, true);
};

btnForward.onclick = () => {
  if (forwardHistory.length === 0) return;
  if (currentSearch) searchHistory.push(currentSearch);
  currentSearch = forwardHistory.pop();
  searchInput.value = currentSearch.query;
  runSearch(currentSearch.source, true);
};

// --- MAIN SEARCH LOGIC ---
async function runSearch(source, isHistory = false) {
  const query = searchInput.value.trim();
  if (!query) return;

  if (!isHistory) {
    if (currentSearch && (currentSearch.query !== query || currentSearch.source !== source)) {
      searchHistory.push(currentSearch);
    }
    forwardHistory = [];
    currentSearch = { query, source };
  }
  updateHistoryButtons();

  document.getElementById('search-results').style.display = 'none';
  const stateContainer = document.getElementById('search-state-container');
  stateContainer.style.display = 'block';
  document.getElementById('search-state-gif').src = 'assets/gifs/search.gif';
  document.getElementById('search-state-text').innerText = 'Gecko is hunting...';

  const response = await fetch('http://localhost:5000/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source })
  });
  const tracks = await response.json();

  stateContainer.style.display = 'none';
  document.getElementById('search-results').style.display = 'block';
  searchResults.innerHTML = '';

  tracks.forEach(track => {
    const row = document.createElement('div');
    row.className = 'song-row';
    track.domElement = row;

    const previewBtn = document.createElement('button');
    previewBtn.innerText = '▶ Preview';
    previewBtn.onclick = () => {
      resetActiveUI();
      activeRow = row;
      activePreviewBtn = previewBtn;
      row.classList.add('active-row');
      previewBtn.innerText = '🔊 Playing...';
      previewBtn.style.color = '#ffffff';
      playPreview(track);
    };

    const downBtn = document.createElement('button');
    downBtn.innerText = '⬇ Download';
    downBtn.onclick = () => downloadTrack(track, downBtn);

    const text = document.createElement('span');
    text.className = 'song-text';
    text.innerText = track.source === 'youtube' ? `[YT] ${track.title}` : `[S] ${track.artist} — ${track.title}`;

    row.appendChild(previewBtn);
    row.appendChild(downBtn);
    row.appendChild(text);
    searchResults.appendChild(row);
  });

  fetchAISuggestions(query);
}

document.getElementById('btn-yt').addEventListener('click', () => runSearch('youtube'));
document.getElementById('btn-deezer').addEventListener('click', () => runSearch('deezer'));

async function playPreview(track) {
  playerMenuContainer.style.display = 'none';
  trackTitleText.innerText = `Loading Preview...`;
  try {
    const response = await fetch('http://localhost:5000/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track)
    });
    const data = await response.json();
    if (!response.ok || data.error || !data.stream_url) {
      trackTitleText.innerText = `❌ No free preview available`;
      resetActiveUI();
      return;
    }
    isPlayingPreview = true;
    progressBar.value = 0;
  progressBar.style.setProperty('--progress-pct', '0%');
  currentTimeText.innerText = '0:00';
  totalTimeText.innerText = '0:00';
    audio.src = data.stream_url;
    setupAudioEngine();
    audio.play();
    btnMagicSuggest.style.display = 'inline-flex';

    trackTitleText.innerText = `[Preview] ${track.artist || 'Web'} — ${track.title}`;
    playBtn.innerText = '⏸ Pause';

    updateWindowsMediaOverlay(`[Preview] ${track.title}`, track.artist || 'GeckTrack Search');

  } catch (err) {
    trackTitleText.innerText = `❌ Network Error`;
    resetActiveUI();
  }
}

async function downloadTrack(track, buttonElement) {
  buttonElement.innerText = '⏳ Downloading...';
  buttonElement.classList.add('btn-downloading');
  const response = await fetch('http://localhost:5000/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(track)
  });
  const data = await response.json();
  buttonElement.classList.remove('btn-downloading');
  if (data.success) {
    buttonElement.innerText = '✓ Saved';
    buttonElement.style.background = '#1db954';
    buttonElement.style.color = 'black';
  } else {
    buttonElement.innerText = '❌ Error';
    buttonElement.style.background = '#e74c3c';
  }
}

// --- AUTO-DJ & AI SUGGESTIONS LOGIC ---
async function callSuggestAPI(query, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('http://localhost:5000/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!response.ok && attempt < retries) {
        // Server might be starting up — wait and retry
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return await response.json();
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return { success: false, error: err.message };
    }
  }
}

btnMagicSuggest.onclick = async () => {
  const currentTitle = trackTitleText.innerText.replace('[Preview] ', '');
  btnMagicSuggest.innerText = '⏳';
  try {
    const data = await callSuggestAPI(currentTitle);
    if (data.success && data.data) {
      tabSearch.click();
      const suggestionsArray = data.data.split('|').map(s => s.trim()).filter(s => s);
      renderSuggestionsUI(suggestionsArray, `✨ Since you're listening to "${currentTitle}":`);
    } else {
      trackTitleText.innerText = `❌ AI suggest failed: ${data.error || 'Unknown error'}`;
    }
  } catch (err) {
    trackTitleText.innerText = `❌ Network error`;
  }
  finally { btnMagicSuggest.innerText = '✨'; }
};

async function fetchAISuggestions(query) {
  aiSuggestionsBox.innerHTML = '<span style="color: var(--text-color); font-size: 14px;">✨ Searching similar...</span>';
  try {
    const data = await callSuggestAPI(query);
    if (!data.success) { aiSuggestionsBox.innerHTML = ''; return; }
    const suggestionsArray = data.data.split('|').map(s => s.trim()).filter(s => s);
    renderSuggestionsUI(suggestionsArray, '✨ Also try these:');
  } catch (error) {
    aiSuggestionsBox.innerHTML = '';
  }
}

function renderSuggestionsUI(suggestionsArray, headerText) {
  const aiBox = document.getElementById('ai-suggestions');
  aiBox.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ai-header';
  header.innerText = headerText;
  aiBox.appendChild(header);

  const visibleLimit = 3;
  const visibleList = suggestionsArray.slice(0, visibleLimit);
  const hiddenList = suggestionsArray.slice(visibleLimit);

  const createBtn = (text) => {
    const btn = document.createElement('button');
    btn.className = 'ai-btn';
    btn.innerText = text;
    btn.onclick = () => {
      document.getElementById('search-input').value = text;
      document.getElementById('btn-yt').click();
    };
    return btn;
  };

  visibleList.forEach(text => aiBox.appendChild(createBtn(text)));

  if (hiddenList.length > 0) {
    const btnShowMore = document.createElement('button');
    btnShowMore.className = 'ai-btn';
    btnShowMore.innerText = 'Show More ▼';
    btnShowMore.style.fontWeight = 'bold';

    const hiddenDiv = document.createElement('div');
    hiddenDiv.style.display = 'none';
    hiddenDiv.style.width = '100%';
    hiddenDiv.style.gap = '10px';
    hiddenDiv.style.flexWrap = 'wrap';
    hiddenDiv.style.marginTop = '5px';

    hiddenList.forEach(text => hiddenDiv.appendChild(createBtn(text)));

    btnShowMore.onclick = () => {
      if (hiddenDiv.style.display === 'none') {
        hiddenDiv.style.display = 'flex';
        btnShowMore.innerText = 'Show Less ▲';
      } else {
        hiddenDiv.style.display = 'none';
        btnShowMore.innerText = 'Show More ▼';
      }
    };

    aiBox.appendChild(btnShowMore);
    aiBox.appendChild(hiddenDiv);
  }
}

// --- PLAYLIST CREATION & SIDEBAR LOGIC ---
async function fetchPlaylists() {
  try {
    const res = await fetch('http://localhost:5000/api/playlists');
    allPlaylists = await res.json();
    renderPlaylistSidebar();
  } catch (e) { console.error("Failed to load playlists"); }
}

function renderPlaylistSidebar() {
  playlistList.innerHTML = `
    <button class="playlist-btn ${currentPlaylistView === null ? 'active' : ''}" id="btn-all-music" title="All Music">
      <span style="font-size: 24px; min-width: 32px; text-align: center; flex-shrink: 0;">🎵</span>
      <span class="playlist-text">All Music</span>
    </button>`;

  document.getElementById('btn-all-music').onclick = () => {
    currentPlaylistView = null;
    libraryViewTitle.innerText = "All Music";
    fetchPlaylists();
    loadLibrary();
  };

  allPlaylists.forEach(p => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.width = '100%';
    row.style.justifyContent = 'space-between';

    const btn = document.createElement('button');
    btn.className = `playlist-btn ${currentPlaylistView === p.id ? 'active' : ''}`;
    btn.title = p.name;

    // THE FIX: Use getSafePath to escape the app.asar ZIP file
    const safeIconUrl = getSafePath(p.icon, 'icons');
    const iconHtml = p.icon
      ? `<img src="${safeIconUrl}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover; flex-shrink: 0;">`
      : `<span style="font-size: 24px; min-width: 32px; text-align: center; display: inline-block; flex-shrink: 0;">📁</span>`;

    btn.innerHTML = `${iconHtml} <span class="playlist-text">${p.name}</span>`;

    btn.onclick = () => {
      currentPlaylistView = p.id;
      libraryViewTitle.innerText = p.name;
      fetchPlaylists();
      loadLibrary();
    };

    const editBtn = document.createElement('button');
    editBtn.innerText = '✏️';
    editBtn.className = 'icon-btn';
    editBtn.title = "Edit Playlist";
    editBtn.style.opacity = '0.5';
    editBtn.style.width = 'auto';

    editBtn.onmouseenter = () => editBtn.style.opacity = '1';
    editBtn.onmouseleave = () => editBtn.style.opacity = '0.5';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openEditPlaylistModal(p);
    };

    row.appendChild(btn);
    row.appendChild(editBtn);
    playlistList.appendChild(row);
  });
}

// RESTORED: Open New Playlist Modal
document.getElementById('btn-new-playlist').onclick = () => {
  newPlaylistInput.value = '';
  selectedCreateIcon = null;
  Array.from(createIconGallery.children).forEach(c => c.style.borderColor = 'transparent');
  createPlaylistModal.style.display = 'flex';
  newPlaylistInput.focus();
};

document.getElementById('btn-confirm-create').onclick = async () => {
  const name = newPlaylistInput.value.trim();
  if (!name) return;

  let finalIcon = selectedCreateIcon;
  if (!finalIcon && availableIcons.length > 0) {
    finalIcon = availableIcons[Math.floor(Math.random() * availableIcons.length)];
  }

  const res = await fetch('http://localhost:5000/api/playlists/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icon: finalIcon || '' })
  });
  if (res.ok) {
    createPlaylistModal.style.display = 'none';
    fetchPlaylists();
  }
};

document.getElementById('btn-cancel-create').onclick = () => createPlaylistModal.style.display = 'none';

function openEditPlaylistModal(playlist) {
  playlistToEdit = playlist;
  editPlaylistInput.value = playlist.name;
  selectedEditIcon = null;

  Array.from(editIconGallery.children).forEach(img => {
    // Normalize path comparison for the green border check
    const imgPath = img.src.replace('file:///', '').replace('file://', '');
    const playlistIconPath = (playlist.icon || '').replace(/\\/g, '/');

    if (imgPath.endsWith(playlistIconPath)) {
      img.style.borderColor = '#1db954';
    } else {
      img.style.borderColor = 'transparent';
    }
  });

  editPlaylistModal.style.display = 'flex';
}

document.getElementById('btn-cancel-edit-playlist').onclick = () => editPlaylistModal.style.display = 'none';

document.getElementById('btn-confirm-edit-playlist').onclick = async () => {
  if (!playlistToEdit) return;
  const newName = editPlaylistInput.value.trim();
  const finalIcon = selectedEditIcon || playlistToEdit.icon;

  const res = await fetch('http://localhost:5000/api/playlists/edit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: playlistToEdit.id, name: newName, icon: finalIcon })
  });

  if (res.ok) {
    editPlaylistModal.style.display = 'none';
    if (currentPlaylistView === playlistToEdit.id) libraryViewTitle.innerText = newName;
    fetchPlaylists();
  }
};

document.getElementById('btn-delete-playlist').onclick = () => {
  showConfirm(
    '🗑️ Delete Playlist',
    `Are you sure you want to delete the playlist "${playlistToEdit.name}"? (Songs will remain in your library)`,
    async () => {
      await fetch('http://localhost:5000/api/playlists/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistToEdit.id })
      });

      document.getElementById('edit-playlist-modal').style.display = 'none';
      if (currentPlaylistView === playlistToEdit.id) {
        currentPlaylistView = null;
        document.getElementById('library-view-title').innerText = "All Music";
      }

      fetchPlaylists();
      loadLibrary();
    }
  );
};

// --- ADDING TO PLAYLIST MODAL LOGIC ---
function fillPlaylistDropdown() {
  playlistSelect.innerHTML = '';
  allPlaylists.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = p.name;
    playlistSelect.appendChild(opt);
  });
}

function openPlaylistModal(track) {
  if (allPlaylists.length === 0) { alert("Create a playlist first!"); return; }
  trackToAddToPlaylist = track;
  playlistTrackName.innerText = track.title;
  playlistStatus.innerText = '';

  fillPlaylistDropdown();
  playlistModal.style.display = 'flex';
  playlistModal.dataset.mode = 'single'; // Tag the modal so handler knows which logic to run
}

async function handleSingleAdd() {
  const targetPlaylistId = playlistSelect.value;
  if (!targetPlaylistId || !trackToAddToPlaylist) return;
  playlistStatus.innerText = 'Adding...';
  const res = await fetch('http://localhost:5000/api/playlists/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: targetPlaylistId, track: trackToAddToPlaylist })
  });
  const data = await res.json();
  if (data.success) {
    playlistStatus.style.color = '#1db954';
    playlistStatus.innerText = '✅ Added!';
    fetchPlaylists();
    if (currentPlaylistView === targetPlaylistId) loadLibrary();
    setTimeout(() => {
      playlistModal.style.display = 'none';
      playlistModal.dataset.mode = ''; // Reset mode after close
    }, 1000);
  }
}

// ── Central confirm handler: dispatches based on modal mode ──────────────────
document.getElementById('btn-confirm-playlist').onclick = async () => {
  if (playlistModal.dataset.mode === 'bulk') {
    const targetId = playlistSelect.value;
    playlistStatus.style.color = 'white';
    playlistStatus.innerText = 'Adding bulk...';
    for (let path of selectedTracks) {
      const trackObj = queue.find(t => t.file_path === path);
      if (trackObj) {
        await fetch('http://localhost:5000/api/playlists/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: targetId, track: trackObj })
        });
      }
    }
    playlistStatus.style.color = '#1db954';
    playlistStatus.innerText = '✅ Done!';
    setTimeout(() => {
      playlistModal.style.display = 'none';
      playlistModal.dataset.mode = '';
      selectedTracks.clear();
      fetchPlaylists();
      loadLibrary();
      updateBulkBar();
    }, 1000);
  } else {
    await handleSingleAdd();
  }
};

document.getElementById('btn-cancel-playlist').onclick = () => {
  playlistModal.style.display = 'none';
  playlistModal.dataset.mode = '';
};

// --- MAIN LIBRARY LOAD & ROW GENERATION ---
async function loadLibrary() {
  libraryResults.innerHTML = '';
  try {
    const response = await fetch('http://localhost:5000/api/library');
    let tracks = await response.json();

    if (currentPlaylistView !== null) {
      const targetPlaylist = allPlaylists.find(p => p.id === currentPlaylistView);
      if (targetPlaylist) tracks = targetPlaylist.tracks;
    }

    const searchQuery = librarySearchInput.value.toLowerCase().trim();
    if (searchQuery) {
      tracks = tracks.filter(t =>
        (t.title && t.title.toLowerCase().includes(searchQuery)) ||
        (t.artist && t.artist.toLowerCase().includes(searchQuery))
      );
    }

    if (!Array.isArray(tracks)) { libraryResults.innerHTML = `<p style="color: red;">Error: Library file is corrupted.</p>`; return; }
    if (tracks.length === 0) { libraryResults.innerHTML = '<p style="color: gray;">No tracks here.</p>'; return; }

    queue = [...tracks];

    tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'song-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'song-checkbox';
      cb.checked = selectedTracks.has(track.file_path);

      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        if (cb.checked) selectedTracks.add(track.file_path);
        else selectedTracks.delete(track.file_path);
        updateBulkBar();
      };

      const playLocalBtn = document.createElement('button');
      playLocalBtn.innerText = '▶';
      playLocalBtn.setAttribute('data-is-library', 'true');
      track.playBtnElement = playLocalBtn;

      const menuContainer = document.createElement('div');
      menuContainer.className = 'song-menu-container';

      const menuBtn = document.createElement('button');
      menuBtn.innerText = '⋮';
      menuBtn.className = 'song-menu-btn';
      menuBtn.title = "Options";

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu';
      dropdown.style.display = 'none';

      const renameOpt = document.createElement('button');
      renameOpt.className = 'dropdown-item';
      renameOpt.innerText = '✏️ Edit Info';
      renameOpt.onclick = (e) => { e.stopPropagation(); dropdown.style.display = 'none'; openRenameModal(track); };

      const addOpt = document.createElement('button');
      addOpt.className = 'dropdown-item';
      addOpt.innerText = '➕ Add to Playlist';
      addOpt.onclick = (e) => { e.stopPropagation(); dropdown.style.display = 'none'; openPlaylistModal(track); };

      const trimOpt = document.createElement('button');
      trimOpt.className = 'dropdown-item';
      trimOpt.innerText = '✂️ Trim Audio';
      trimOpt.onclick = (e) => { e.stopPropagation(); dropdown.style.display = 'none'; openTrimModal(track); };

      const delOpt = document.createElement('button');
      delOpt.className = 'dropdown-item';
      delOpt.innerText = '🗑️ Delete from Library';
      delOpt.style.color = 'var(--danger-color)';
      delOpt.onclick = (e) => {
        e.stopPropagation();
        dropdown.style.display = 'none';
        showConfirm(
          '🗑️ Delete Song',
          `Are you sure you want to permanently delete "${track.title}" from your library?`,
          async () => {
            await fetch('http://localhost:5000/api/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file_path: track.file_path })
            });
            loadLibrary();
          }
        );
      };

      dropdown.appendChild(renameOpt);
      dropdown.appendChild(addOpt);
      dropdown.appendChild(trimOpt);
      dropdown.appendChild(delOpt);

      if (currentPlaylistView !== null) {
        const removeOpt = document.createElement('button');
        removeOpt.className = 'dropdown-item';
        removeOpt.innerText = '➖ Remove from Playlist';
        removeOpt.onclick = async (e) => {
          e.stopPropagation();
          dropdown.style.display = 'none';
          const res = await fetch('http://localhost:5000/api/playlists/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playlist_id: currentPlaylistView, file_path: track.file_path }) });
          if (res.ok) { fetchPlaylists(); loadLibrary(); }
        };
        dropdown.appendChild(removeOpt);
      }

      menuBtn.onclick = (e) => {
        e.stopPropagation();
        const isAlreadyOpen = dropdown.style.display === 'flex';
        document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
        document.querySelectorAll('.song-row').forEach(r => r.style.zIndex = '1');

        if (!isAlreadyOpen) {
          dropdown.style.display = 'flex';
          row.style.position = 'relative';
          row.style.zIndex = '9999';
        }
      };

      menuContainer.appendChild(menuBtn);
      menuContainer.appendChild(dropdown);

      const text = document.createElement('span');
      text.className = 'song-text';
      text.innerText = track.source === 'youtube' ? track.title : `${track.artist} — ${track.title}`;

      row.prepend(cb);
      row.appendChild(playLocalBtn);
      row.appendChild(text);
      row.appendChild(menuContainer);

      if (currentPlayingFilePath === track.file_path) {
        row.classList.add('active-row');
        playLocalBtn.innerText = '🔊';
        playLocalBtn.style.color = '#1db954';
        activeRow = row;
        activePreviewBtn = playLocalBtn;
      }

      track.domElement = row;
      playLocalBtn.onclick = () => playQueueTrack(index);
      libraryResults.appendChild(row);
    });
  } catch (error) { libraryResults.innerHTML = `<p style="color: red;">JS Crash: ${error.message}</p>`; }
}

// --- RENAME MODAL LOGIC ---
let trackToRename = null;
function openRenameModal(track) {
  trackToRename = track;
  renameArtistInput.value = track.artist || '';
  renameTitleInput.value = track.title || '';
  renameModal.style.display = 'flex';
  renameTitleInput.focus();
}

document.getElementById('btn-cancel-rename').onclick = () => renameModal.style.display = 'none';

document.getElementById('btn-confirm-rename').onclick = async () => {
  if (!trackToRename) return;
  const newArtist = renameArtistInput.value.trim();
  const newTitle = renameTitleInput.value.trim();
  if (!newTitle) return;

  const res = await fetch('http://localhost:5000/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_path: trackToRename.file_path,
      new_artist: newArtist,
      new_title: newTitle
    })
  });

  if (res.ok) {
    renameModal.style.display = 'none';
    if (currentPlayingFilePath === trackToRename.file_path) {
      trackTitleText.innerText = `${newArtist} — ${newTitle}`;
      updateWindowsMediaOverlay(`${newArtist} — ${newTitle}`, newArtist);
    }
    await fetchPlaylists();
    loadLibrary();
  }
};

// --- AUDIO TRIMMER MODAL LOGIC ---
function openTrimModal(track) {
  trimModal.style.display = 'flex';
  trimTrackName.innerText = track.title;
  trimStatus.innerText = '';
  btnPreviewTrim.innerText = '▶ Play Selection';
  trimAudioPlayer.src = getSafePath(track.file_path);

  trimAudioPlayer.onloadedmetadata = () => {
    trimStart.max = trimAudioPlayer.duration;
    trimEnd.max = trimAudioPlayer.duration;
    trimStart.value = 0;
    trimEnd.value = Math.min(30, trimAudioPlayer.duration);
    updateSliderDisplays();
  };

  trimStart.oninput = () => {
    if (parseFloat(trimStart.value) >= parseFloat(trimEnd.value)) trimStart.value = parseFloat(trimEnd.value) - 0.1;
    updateSliderDisplays();
  };
  trimEnd.oninput = () => {
    if (parseFloat(trimEnd.value) <= parseFloat(trimStart.value)) trimEnd.value = parseFloat(trimStart.value) + 0.1;
    updateSliderDisplays();
  };
  function updateSliderDisplays() {
    trimStartDisplay.innerText = parseFloat(trimStart.value).toFixed(1) + 's';
    trimEndDisplay.innerText = parseFloat(trimEnd.value).toFixed(1) + 's';
  }

  let isPreviewing = false;
  btnPreviewTrim.onclick = () => {
    if (isPreviewing) { trimAudioPlayer.pause(); btnPreviewTrim.innerText = '▶ Play Selection'; isPreviewing = false; }
    else { trimAudioPlayer.currentTime = parseFloat(trimStart.value); trimAudioPlayer.play(); btnPreviewTrim.innerText = '⏸ Stop Preview'; isPreviewing = true; }
  };
  trimAudioPlayer.ontimeupdate = () => {
    if (isPreviewing && trimAudioPlayer.currentTime >= parseFloat(trimEnd.value)) {
      trimAudioPlayer.pause(); btnPreviewTrim.innerText = '▶ Play Selection'; isPreviewing = false;
    }
  };
  document.getElementById('btn-cancel-trim').onclick = () => { trimAudioPlayer.pause(); trimModal.style.display = 'none'; };
  document.getElementById('btn-confirm-trim').onclick = async () => {
    trimAudioPlayer.pause();
    trimAudioPlayer.removeAttribute('src');
    trimAudioPlayer.load();

    trimStatus.style.color = 'var(--text-color)';
    trimStatus.innerText = '✂️ Slicing...';

    // Resolve the file path: if it's an absolute dev path, keep it so the
    // packaged server can still reach dev-mode downloads (same filesystem).
    // If it's relative, resolve it from the downloads folder.
    const resolvedPath = track.file_path.match(/^[A-Z]:[\\\/]/i)
      ? track.file_path
      : path.join(downloadsPath, track.file_path).replace(/\\/g, '/');

    try {
      const res = await fetch('http://localhost:5000/api/trim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: { ...track, file_path: resolvedPath },
          start_time: parseFloat(trimStart.value),
          end_time: parseFloat(trimEnd.value)
        })
      });
      const data = await res.json();
      if (data.success) {
        trimStatus.style.color = '#1db954';
        trimStatus.innerText = '✅ Saved!';
        setTimeout(() => { trimModal.style.display = 'none'; loadLibrary(); }, 1500);
      } else {
        trimStatus.style.color = 'var(--danger-color)';
        trimStatus.innerText = `❌ ${data.error || 'Trim failed'}`;
      }
    } catch (e) {
      trimStatus.style.color = 'var(--danger-color)';
      trimStatus.innerText = '❌ Network Error.';
    }
  };
}

// --- GLOBAL CLICKS & MENUS ---
document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.song-row').forEach(row => row.style.zIndex = '1');
});

btnPlayerMenu.onclick = (e) => {
  e.stopPropagation();
  const isAlreadyOpen = playerDropdown.style.display === 'flex';
  document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  if (!isAlreadyOpen) { playerDropdown.style.display = 'flex'; }
};

playerOptRename.onclick = (e) => {
  e.stopPropagation();
  playerDropdown.style.display = 'none';
  openRenameModal(queue[queueIndex]);
};

playerOptAdd.onclick = (e) => {
  e.stopPropagation();
  playerDropdown.style.display = 'none';
  openPlaylistModal(queue[queueIndex]);
};

playerOptTrim.onclick = (e) => {
  e.stopPropagation();
  playerDropdown.style.display = 'none';
  openTrimModal(queue[queueIndex]);
};

playerOptDel.onclick = async (e) => {
  e.stopPropagation();
  playerDropdown.style.display = 'none';
  const track = queue[queueIndex];

  showConfirm(
    '🗑️ Delete Song',
    `Are you sure you want to permanently delete "${track.title}"?`,
    async () => {
      await fetch('http://localhost:5000/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(track) });
      await fetchPlaylists();
      loadLibrary();
      playNext();
    }
  );
};

// --- ICON GALLERY LOADER ---
async function loadIconGalleries() {
  try {
    const res = await fetch('http://localhost:5000/api/icons');
    availableIcons = await res.json();

    function buildGallery(container, isEditMode) {
      if (!container) return;
      container.innerHTML = '';
      availableIcons.forEach(iconPath => {
        const img = document.createElement('img');

        // THE FIX: Use getSafePath for the gallery too!
        img.src = getSafePath(iconPath, 'icons');

        img.style.width = '32px';
        img.style.height = '32px';
        img.style.cursor = 'pointer';
        img.style.borderRadius = '4px';
        img.style.border = '2px solid transparent';
        img.style.transition = '0.2s';

        img.onclick = () => {
          Array.from(container.children).forEach(child => child.style.borderColor = 'transparent');
          img.style.borderColor = '#1db954';
          if (isEditMode) selectedEditIcon = iconPath;
          else selectedCreateIcon = iconPath;
        };
        container.appendChild(img);
      });
    }

    buildGallery(createIconGallery, false);
    buildGallery(editIconGallery, true);
  } catch (e) { console.error("Failed to load icons"); }
}

// --- MULTI-SELECTION & BULK ACTIONS ---
let isSelectionMode = false;
const btnToggleSelect = document.getElementById('btn-toggle-select');
const libraryResultsContainer = document.getElementById('library-results');

btnToggleSelect.onclick = () => {
  isSelectionMode = !isSelectionMode;
  if (isSelectionMode) {
    libraryResultsContainer.classList.add('selection-mode-active');
    btnToggleSelect.innerHTML = "⛔ Cancel";
    btnToggleSelect.style.background = 'var(--danger-color)';
    btnToggleSelect.style.color = 'white';
  } else {
    libraryResultsContainer.classList.remove('selection-mode-active');
    btnToggleSelect.innerHTML =  "☑️ Select";
    btnToggleSelect.style.background = '';
    btnToggleSelect.style.color = '';
    selectedTracks.clear();
    updateBulkBar();
    document.querySelectorAll('.song-checkbox').forEach(cb => cb.checked = false);
  }
};
function updateBulkBar() {
  const count = selectedTracks.size;
  if (count > 0) {
    bulkBar.style.display = 'flex';
    bulkCount.innerText = `${count} song${count > 1 ? 's' : ''} selected`;
    btnBulkRemove.style.display = currentPlaylistView !== null ? 'block' : 'none';
  } else {
    bulkBar.style.display = 'none';
  }
}

document.getElementById('btn-bulk-delete').onclick = () => {
  showConfirm('🗑️ Bulk Delete', `Permanently delete ${selectedTracks.size} songs from your library?`, async () => {
    for (let path of selectedTracks) {
      await fetch('http://localhost:5000/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path })
      });
    }
    selectedTracks.clear();
    await fetchPlaylists();
    loadLibrary();
    if (isSelectionMode) btnToggleSelect.click();
    updateBulkBar();
  });
};

document.getElementById('btn-bulk-remove').onclick = async () => {
  for (let path of selectedTracks) {
    await fetch('http://localhost:5000/api/playlists/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist_id: currentPlaylistView, file_path: path })
    });
  }
  selectedTracks.clear();
  fetchPlaylists();
  loadLibrary();
  updateBulkBar();
};

document.getElementById('btn-bulk-add').onclick = () => {
  if (allPlaylists.length === 0) { alert("Create a playlist first!"); return; }
  playlistTrackName.innerText = `${selectedTracks.size} selected songs`;
  playlistStatus.innerText = '';
  fillPlaylistDropdown();
  playlistModal.dataset.mode = 'bulk';
  playlistModal.style.display = 'flex';
};

// --- INITIAL BOOTUP ---
fetchPlaylists();
loadIconGalleries();