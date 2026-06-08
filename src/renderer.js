const dropZone = document.getElementById('dropZone');
const fileTable = document.getElementById('fileTable');
const emptyState = document.getElementById('emptyState');
const addImagesBtn = document.getElementById('addImagesBtn');
const clearBtn = document.getElementById('clearBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const optimiseBtn = document.getElementById('optimiseBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const outputFolderInput = document.getElementById('outputFolder');
const statusText = document.getElementById('statusText');
const aboutBtn = document.getElementById('aboutBtn');
const aboutModal = document.getElementById('aboutModal');
const closeAboutBtn = document.getElementById('closeAboutBtn');

const presetEl = document.getElementById('preset');
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
const validFormats = new Set(['webp', 'jpeg', 'png', 'avif']);

let files = [];
let latestOutputFolder = null;
let fileStats = new Map();

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function fileName(filePath) {
  return String(filePath).split(/[\\/]/).pop();
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function renderTable(rows = []) {
  emptyState.classList.toggle('hidden', files.length || rows.length);

  if (!files.length && !rows.length) {
    fileTable.innerHTML = '';
    return;
  }

  if (!rows.length) {
    fileTable.innerHTML = files.map((file, index) => `
      <tr>
        <td>${index + 1}</td>
        <td title="${escapeHtml(file)}">${escapeHtml(fileName(file))}</td>
        <td>${fileStats.get(file)?.size || 'Pending'}</td>
        <td>Pending</td>
        <td>Pending</td>
        <td>Queued</td>
      </tr>
    `).join('');
    return;
  }

  fileTable.innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td title="${escapeHtml(row.output)}">${escapeHtml(row.outputName)}</td>
      <td>${row.originalSize}</td>
      <td>${row.optimisedSize}</td>
      <td>${row.savedPercent}%</td>
      <td>${row.status}</td>
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
  const incoming = normaliseIncoming(input);
  const unique = new Set([...files, ...incoming]);
  files = Array.from(unique);
  imageCountInlineEl.textContent = files.length;
  statusText.textContent = files.length ? `${files.length} image(s) queued.` : 'Ready.';
  await updateOriginalTotals();
  renderTable();
}

function syncFormatButtons() {
  formatButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.format === formatEl.value));
}

function setFormat(format) {
  const nextFormat = validFormats.has(format) ? format : 'webp';
  formatEl.value = nextFormat;
  syncFormatButtons();
}

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
  await addFiles(event.dataTransfer.files);
});

clearBtn.addEventListener('click', () => {
  files = [];
  fileStats = new Map();
  latestOutputFolder = null;
  openFolderBtn.disabled = true;
  statusText.textContent = 'Ready.';
  imageCountInlineEl.textContent = '0';
  resetTotals('0 B');
  renderTable();
});

selectFolderBtn.addEventListener('click', async () => {
  const folder = await window.imageForge.selectOutputFolder();
  if (folder) outputFolderInput.value = folder;
});

presetEl.addEventListener('change', () => {
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
    if (!outputFolderInput.value) {
      statusText.textContent = 'Choose an output folder first.';
      return;
    }

    optimiseBtn.disabled = true;
    statusText.textContent = 'Optimising images...';
    setFormat(formatEl.value);

    const settings = {
      preset: presetEl.value,
      format: formatEl.value,
      quality: Number(qualityEl.value),
      maxWidth: Number(maxWidthEl.value) || null,
      filenameSuffix: filenameSuffixEl.value,
      keepFilename: keepFilenameEl.checked,
      lossless: losslessEl.checked,
      keepMetadata: keepMetadataEl.checked,
      outputFolder: outputFolderInput.value
    };

    const output = await window.imageForge.optimiseImages({ files, settings });
    latestOutputFolder = output.outputFolder;
    openFolderBtn.disabled = false;

    imageCountInlineEl.textContent = output.results.length;
    originalTotalEl.textContent = output.totals.originalSize;
    optimisedTotalEl.textContent = output.totals.optimisedSize;
    savedTotalEl.textContent = output.totals.savedSize;
    savedPercentEl.textContent = `${output.totals.savedPercent}%`;

    renderTable(output.results);
    statusText.textContent = `Complete. Saved ${output.totals.savedSize} (${output.totals.savedPercent}%).`;
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

syncFormatButtons();
renderTable();
