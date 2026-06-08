const dropZone = document.getElementById('dropZone');
const fileTable = document.getElementById('fileTable');
const emptyState = document.getElementById('emptyState');
const addImagesBtn = document.getElementById('addImagesBtn');
const clearBtn = document.getElementById('clearBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const optimiseBtn = document.getElementById('optimiseBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const outputFolderInput = document.getElementById('outputFolder');
const useSourceOutputFolderEl = document.getElementById('useSourceOutputFolder');
const statusText = document.getElementById('statusText');
const aboutBtn = document.getElementById('aboutBtn');
const aboutModal = document.getElementById('aboutModal');
const closeAboutBtn = document.getElementById('closeAboutBtn');
const aboutVersionEl = document.getElementById('aboutVersion');

const presetEl = document.getElementById('preset');
const presetDescriptionEl = document.getElementById('presetDescription');
const formatEl = document.getElementById('format');
const qualityEl = document.getElementById('quality');
const qualityNumberEl = document.getElementById('qualityNumber');
const maxWidthEl = document.getElementById('maxWidth');
const filenameSuffixEl = document.getElementById('filenameSuffix');
const keepFilenameEl = document.getElementById('keepFilename');
const losslessEl = document.getElementById('lossless');
const keepMetadataEl = document.getElementById('keepMetadata');

const imageCountInlineEl = document.getElementById('imageCountInline');
const originalTotalEl = document.getElementById('originalTotal');
const optimisedTotalEl = document.getElementById('optimisedTotal');
const savedTotalEl = document.getElementById('savedTotal');
const savedPercentEl = document.getElementById('savedPercent');
const formatButtons = Array.from(document.querySelectorAll('.format-btn'));
const sortButtons = Array.from(document.querySelectorAll('.sort-header'));
const validFormats = new Set(['webp', 'jpeg', 'png', 'avif']);

const presetDescriptions = {
  'web-ready': 'Balanced optimisation for websites and general sharing.',
  smallest: 'Maximum compression for the smallest practical file size.',
  'high-quality': 'Light compression while preserving visual quality.',
  lossless: 'No quality loss where supported by the selected format.',
  custom: 'Manual control over format, quality and output settings.'
};

let files = [];
let latestOutputFolder = null;
let fileStats = new Map();
let fileSources = new Map();
let currentRows = [];
let rowMode = 'pending';
let sortState = { key: 'name', direction: 'asc' };
let manualOutputFolder = '';

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function fileName(filePath) {
  return String(filePath).split(/[\\/]/).pop();
}

function folderName(filePath) {
  const value = String(filePath);
  const index = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
  return index > -1 ? value.slice(0, index) : '';
}

function joinPath(folderPath, childName) {
  const separator = String(folderPath).includes('\\') ? '\\' : '/';
  return `${String(folderPath).replace(/[\\/]+$/, '')}${separator}${childName}`;
}

function dedupeKey(filePath) {
  return String(filePath).toLowerCase();
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function statusBadge(status) {
  const normalised = String(status || 'Pending').toLowerCase().replace(/\s+/g, '-');
  const allowed = new Set(['optimised', 'pending', 'processing', 'failed', 'skipped']);
  const className = allowed.has(normalised) ? normalised : 'pending';
  return `<span class="status-badge status-${className}">${escapeHtml(status || 'Pending')}</span>`;
}

function pendingRows(status = 'Pending') {
  return files.map(file => ({
    file,
    output: file,
    name: fileName(file),
    outputName: fileName(file),
    originalBytes: fileStats.get(file)?.bytes || 0,
    optimisedBytes: 0,
    savedPercent: 0,
    originalSize: fileStats.get(file)?.size || 'Pending',
    optimisedSize: 'Pending',
    savedSize: 'Pending',
    status
  }));
}

function valueForSort(row, key) {
  if (key === 'name') return String(row.name || row.outputName || '').toLowerCase();
  if (key === 'status') return String(row.status || '').toLowerCase();
  return Number(row[key]) || 0;
}

function sortedRows(rows) {
  const direction = sortState.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const first = valueForSort(a, sortState.key);
    const second = valueForSort(b, sortState.key);

    if (typeof first === 'string' || typeof second === 'string') {
      return String(first).localeCompare(String(second), undefined, { numeric: true }) * direction;
    }

    return (first - second) * direction;
  });
}

function updateSortIndicators() {
  sortButtons.forEach(button => {
    button.classList.toggle('sorted-asc', button.dataset.sort === sortState.key && sortState.direction === 'asc');
    button.classList.toggle('sorted-desc', button.dataset.sort === sortState.key && sortState.direction === 'desc');
  });
}

function renderTable(rows = currentRows, mode = rowMode) {
  currentRows = rows;
  rowMode = mode;
  emptyState.classList.toggle('hidden', files.length || rows.length);
  updateSortIndicators();

  if (!files.length && !rows.length) {
    fileTable.innerHTML = '';
    return;
  }

  const displayRows = sortedRows(rows.length ? rows : pendingRows());
  fileTable.innerHTML = displayRows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td title="${escapeHtml(row.output || row.file)}">${escapeHtml(mode === 'results' ? row.outputName : row.name)}</td>
      <td>${row.originalSize}</td>
      <td>${row.optimisedSize}</td>
      <td>${mode === 'results' ? `${row.savedPercent}%` : row.savedSize}</td>
      <td>${statusBadge(row.status)}</td>
    </tr>
  `).join('');
}

function resetTotals(value = '0 B') {
  originalTotalEl.textContent = value;
  optimisedTotalEl.textContent = value;
  savedTotalEl.textContent = value;
  savedPercentEl.textContent = value === 'Pending' ? 'Pending' : '0%';
}

function updateLoadedStats(originalSize = '0 B') {
  imageCountInlineEl.textContent = files.length;
  originalTotalEl.textContent = files.length ? originalSize : '0 B';
  optimisedTotalEl.textContent = '0 B';
  savedTotalEl.textContent = '0 B';
  savedPercentEl.textContent = '0%';
}

function normaliseIncoming(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean);
  return Array.from(input).map(file => file.path).filter(Boolean);
}

function readAllDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    const entries = [];

    function readBatch() {
      reader.readEntries(batch => {
        if (!batch.length) {
          resolve(entries);
          return;
        }

        entries.push(...batch);
        readBatch();
      }, reject);
    }

    readBatch();
  });
}

function fileFromEntry(entry) {
  return new Promise(resolve => {
    entry.file(file => resolve(file.path), () => resolve(null));
  });
}

async function pathsFromEntry(entry) {
  try {
    if (!entry) return [];
    if (entry.isFile) {
      const filePath = await fileFromEntry(entry);
      return filePath ? [filePath] : [];
    }

    if (!entry.isDirectory) return [];
    const entries = await readAllDirectoryEntries(entry.createReader());
    const nested = await Promise.all(entries.map(pathsFromEntry));
    return nested.flat();
  } catch (_error) {
    return [];
  }
}

async function normaliseDroppedItems(dataTransfer) {
  const directPaths = normaliseIncoming(dataTransfer.files);
  if (directPaths.length) return directPaths;

  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (!entries.length) return normaliseIncoming(dataTransfer.files);

  const paths = await Promise.all(entries.map(pathsFromEntry));
  return paths.flat();
}

async function resolveSupportedFiles(input) {
  const incoming = normaliseIncoming(input);
  if (!incoming.length) return [];
  const details = await window.imageForge.resolveInputPathDetails(incoming);
  return details.map(row => ({
    file: row.file,
    sourceFolder: row.sourceFolder || folderName(row.file)
  }));
}

async function updateOriginalTotals() {
  if (!files.length) {
    fileStats = new Map();
    updateLoadedStats();
    return;
  }

  try {
    const stats = await window.imageForge.getFileStats(files);
    fileStats = new Map(stats.rows.map(row => [row.file, row]));
    updateLoadedStats(stats.totalSize);
  } catch (_error) {
    fileStats = new Map();
    originalTotalEl.textContent = formatBytes(0);
    optimisedTotalEl.textContent = '0 B';
    savedTotalEl.textContent = '0 B';
    savedPercentEl.textContent = '0%';
  }
}

async function addFiles(input) {
  const incoming = await resolveSupportedFiles(input);
  const seen = new Set(files.map(dedupeKey));
  const additions = incoming.filter(file => {
    const key = dedupeKey(file.file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  additions.forEach(row => {
    fileSources.set(row.file, row.sourceFolder || folderName(row.file));
  });

  files = [...files, ...additions.map(row => row.file)];
  currentRows = [];
  rowMode = 'pending';
  imageCountInlineEl.textContent = files.length;
  statusText.textContent = files.length ? `${files.length} image(s) queued.` : 'Ready.';
  await updateOriginalTotals();
  updateOutputFolderDisplay();
  renderTable(pendingRows(), 'pending');
}

function syncFormatButtons() {
  formatButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.format === formatEl.value));
}

function setFormat(format) {
  const nextFormat = validFormats.has(format) ? format : 'webp';
  formatEl.value = nextFormat;
  syncFormatButtons();
}

function updatePresetDescription() {
  presetDescriptionEl.textContent = presetDescriptions[presetEl.value] || presetDescriptions.custom;
}

function sourceFolders() {
  const folders = new Map();
  files.forEach(file => {
    const folder = fileSources.get(file) || folderName(file);
    if (!folder) return;
    folders.set(folder.toLowerCase(), folder);
  });
  return Array.from(folders.values());
}

function sourceOutputFolder() {
  const folders = sourceFolders();
  return folders.length === 1 ? joinPath(folders[0], 'Optimised') : '';
}

function activeOutputFolder() {
  const sourceFolder = sourceOutputFolder();
  if (useSourceOutputFolderEl.checked) return sourceFolder;
  return manualOutputFolder;
}

function updateOutputFolderDisplay() {
  const sourceFolder = sourceOutputFolder();
  const shouldUseSourceFolder = useSourceOutputFolderEl.checked && Boolean(sourceFolder);

  outputFolderInput.value = activeOutputFolder();
  selectFolderBtn.disabled = shouldUseSourceFolder;
  outputFolderInput.placeholder = useSourceOutputFolderEl.checked && !sourceFolder && files.length
    ? 'Images from multiple folders require a manual output folder.'
    : 'Choose output folder...';
}

function updateSummary(totals) {
  imageCountInlineEl.textContent = totals.processedCount;
  originalTotalEl.textContent = totals.originalSize;
  optimisedTotalEl.textContent = totals.optimisedSize;
  savedTotalEl.textContent = totals.savedSize;
  savedPercentEl.textContent = `${totals.savedPercent}%`;
}

sortButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    sortState = {
      key,
      direction: sortState.key === key && sortState.direction === 'asc' ? 'desc' : 'asc'
    };
    renderTable();
  });
});

formatButtons.forEach(button => {
  button.addEventListener('click', () => {
    setFormat(button.dataset.format);
  });
});

formatEl.addEventListener('change', () => {
  setFormat(formatEl.value);
});

qualityEl.addEventListener('input', () => { qualityNumberEl.value = qualityEl.value; });
qualityNumberEl.addEventListener('input', () => { qualityEl.value = qualityNumberEl.value; });

addImagesBtn.addEventListener('click', async () => {
  const selected = await window.imageForge.selectImages();
  await addFiles(selected);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', async event => {
  const droppedPaths = await normaliseDroppedItems(event.dataTransfer);
  await addFiles(droppedPaths);
});

clearBtn.addEventListener('click', () => {
  files = [];
  fileStats = new Map();
  fileSources = new Map();
  currentRows = [];
  rowMode = 'pending';
  latestOutputFolder = null;
  manualOutputFolder = '';
  openFolderBtn.disabled = true;
  statusText.textContent = 'Ready.';
  imageCountInlineEl.textContent = '0';
  resetTotals('0 B');
  updateOutputFolderDisplay();
  renderTable([], 'pending');
});

selectFolderBtn.addEventListener('click', async () => {
  const folder = await window.imageForge.selectOutputFolder();
  if (folder) {
    manualOutputFolder = folder;
    updateOutputFolderDisplay();
  }
});

useSourceOutputFolderEl.addEventListener('change', () => {
  updateOutputFolderDisplay();
});

presetEl.addEventListener('change', () => {
  updatePresetDescription();

  if (presetEl.value === 'custom') {
    syncFormatButtons();
    return;
  }

  const presets = {
    'web-ready': {
      format: 'webp',
      quality: 88,
      lossless: false,
      keepMetadata: false,
      maxWidth: 2400
    },
    smallest: {
      format: 'webp',
      quality: 72,
      lossless: false,
      keepMetadata: false,
      maxWidth: 1920
    },
    'high-quality': {
      format: 'webp',
      quality: 94,
      lossless: false,
      keepMetadata: false,
      maxWidth: 0
    },
    lossless: {
      format: 'webp',
      quality: 100,
      lossless: true,
      keepMetadata: false,
      maxWidth: 0
    }
  };

  const preset = presets[presetEl.value];
  if (preset) {
    setFormat(preset.format);
    qualityEl.value = preset.quality;
    qualityNumberEl.value = preset.quality;
    maxWidthEl.value = preset.maxWidth;
    losslessEl.checked = preset.lossless;
    keepMetadataEl.checked = preset.keepMetadata;
  }
});

optimiseBtn.addEventListener('click', async () => {
  try {
    if (!files.length) {
      statusText.textContent = 'Drop some images first.';
      return;
    }
    const smartOutputFolder = sourceOutputFolder();
    const outputFolder = useSourceOutputFolderEl.checked ? smartOutputFolder : manualOutputFolder;

    if (!outputFolder) {
      statusText.textContent = useSourceOutputFolderEl.checked
        ? 'Images from multiple folders require a manual output folder.'
        : 'Please choose an output folder.';
      return;
    }

    optimiseBtn.disabled = true;
    statusText.textContent = 'Optimising images...';
    setFormat(formatEl.value);
    renderTable(pendingRows('Processing'), 'pending');

    const settings = {
      preset: presetEl.value,
      format: formatEl.value,
      quality: Number(qualityEl.value),
      maxWidth: Number(maxWidthEl.value) || null,
      filenameSuffix: filenameSuffixEl.value,
      keepFilename: keepFilenameEl.checked,
      lossless: losslessEl.checked,
      keepMetadata: keepMetadataEl.checked,
      useSourceOutputFolder: useSourceOutputFolderEl.checked,
      outputFolder
    };

    const output = await window.imageForge.optimiseImages({ files, settings });
    latestOutputFolder = output.outputFolder;
    openFolderBtn.disabled = false;

    updateSummary(output.totals);
    renderTable(output.results, 'results');

    const failedCopy = output.totals.failedCount ? ` Failed: ${output.totals.failedCount}.` : '';
    statusText.textContent = `Complete. Saved ${output.totals.savedSize} (${output.totals.averageReduction}% average).${failedCopy}`;
  } catch (error) {
    statusText.textContent = error.message || 'Something went wrong.';
  } finally {
    optimiseBtn.disabled = false;
  }
});

openFolderBtn.addEventListener('click', async () => {
  if (latestOutputFolder) await window.imageForge.openFolder(latestOutputFolder);
});

aboutBtn.addEventListener('click', () => {
  aboutModal.classList.remove('hidden');
});

closeAboutBtn.addEventListener('click', () => {
  aboutModal.classList.add('hidden');
});

aboutModal.addEventListener('click', event => {
  if (event.target === aboutModal) aboutModal.classList.add('hidden');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') aboutModal.classList.add('hidden');
});

async function initialiseVersion() {
  try {
    const version = await window.imageForge.getAppVersion();
    aboutVersionEl.textContent = `Version ${version}`;
  } catch (_error) {
    aboutVersionEl.textContent = 'Version 1.1.0';
  }
}

syncFormatButtons();
updatePresetDescription();
updateSortIndicators();
updateOutputFolderDisplay();
initialiseVersion();
renderTable();
