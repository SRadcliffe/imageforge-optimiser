const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const appIconPath = path.join(__dirname, 'assets', 'favicon.ico');
const appName = 'ImageForge Optimiser';

if (!fs.existsSync(appIconPath)) {
  console.warn(`Warning: Application icon missing at ${appIconPath}`);
}

app.setAppUserModelId('uk.forgeworks.imageforgeoptimiser');
app.setName(appName);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,

    resizable: false,
    maximizable: false,
    fullscreenable: false,

    autoHideMenuBar: true,
    title: appName,

    icon: appIconPath,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setTitle(appName);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
const outputFormats = new Set(['jpeg', 'png', 'webp', 'avif']);

function isImage(filePath) {
  return allowedExt.has(path.extname(filePath).toLowerCase());
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function normaliseFormat(format, fallback = 'webp') {
  const value = String(format || '').toLowerCase();
  const normalised = value === 'jpg' ? 'jpeg' : value;
  const normalisedFallback = fallback === 'jpg' ? 'jpeg' : fallback;

  if (outputFormats.has(normalised)) return normalised;
  if (outputFormats.has(normalisedFallback)) return normalisedFallback;
  return 'webp';
}

function resolveOutputFormat(selectedFormat) {
  return normaliseFormat(selectedFormat);
}

function extensionForFormat(format) {
  return format === 'jpeg' ? '.jpg' : `.${format}`;
}

function getPresetOptions(settings) {
  const preset = settings.preset || 'web-ready';
  const customQuality = Number(settings.quality || 92);
  const filenameSuffix = typeof settings.filenameSuffix === 'string' ? settings.filenameSuffix : '_optimised';

  const presets = {
    'web-ready': {
      format: 'webp',
      quality: 88,
      lossless: false,
      maxWidth: 2400,
      suffix: filenameSuffix
    },
    smallest: {
      format: 'webp',
      quality: 72,
      lossless: false,
      maxWidth: 1920,
      suffix: filenameSuffix
    },
    'high-quality': {
      format: 'webp',
      quality: 94,
      lossless: false,
      maxWidth: null,
      suffix: filenameSuffix
    },
    lossless: {
      format: 'webp',
      quality: 100,
      lossless: true,
      maxWidth: null,
      suffix: filenameSuffix
    },
    custom: {
      format: settings.format || 'webp',
      quality: Math.min(100, Math.max(1, customQuality)),
      lossless: Boolean(settings.lossless),
      maxWidth: settings.maxWidth ? Number(settings.maxWidth) : null,
      suffix: filenameSuffix
    }
  };

  const selectedPreset = presets[preset] || presets['web-ready'];

  return {
    ...selectedPreset,
    format: normaliseFormat(settings.format, selectedPreset.format)
  };
}

async function chooseOutputFolder() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}


async function chooseImages() {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'avif'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
}

ipcMain.handle('select-images', chooseImages);

ipcMain.handle('select-output-folder', chooseOutputFolder);

ipcMain.handle('get-file-stats', async (_event, filePaths = []) => {
  const rows = filePaths.filter(isImage).map(file => {
    const stat = fs.statSync(file);
    return {
      file,
      bytes: stat.size,
      size: formatBytes(stat.size)
    };
  });
  const totalBytes = rows.reduce((sum, item) => sum + item.bytes, 0);

  return {
    rows,
    totalBytes,
    totalSize: formatBytes(totalBytes)
  };
});

ipcMain.handle('open-folder', async (_event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return false;
  await shell.openPath(folderPath);
  return true;
});

ipcMain.handle('optimise-images', async (_event, payload) => {
  const files = (payload.files || []).filter(isImage);
  const settings = payload.settings || {};
  const outputFolder = settings.outputFolder;

  if (!files.length) throw new Error('No supported image files were provided.');
  if (!outputFolder) throw new Error('Please choose an output folder.');

  fs.mkdirSync(outputFolder, { recursive: true });

  const preset = getPresetOptions(settings);
  const results = [];

  for (const file of files) {
    const originalStat = fs.statSync(file);
    const parsed = path.parse(file);
    const safeFormat = resolveOutputFormat(preset.format);
    const outputExt = extensionForFormat(safeFormat);
    const suffix = settings.keepFilename ? '' : preset.suffix;
    const outPath = path.join(outputFolder, `${parsed.name}${suffix}${outputExt}`);

    let pipeline = sharp(file, { animated: false }).rotate();
    const meta = await pipeline.metadata();

    if (preset.maxWidth && meta.width && meta.width > preset.maxWidth) {
      pipeline = pipeline.resize({ width: preset.maxWidth, withoutEnlargement: true });
    }

    if (!settings.keepMetadata) {
      // Default sharp behaviour strips most metadata unless withMetadata() is called.
    } else {
      pipeline = pipeline.withMetadata();
    }

    if (safeFormat === 'webp') {
      pipeline = pipeline.webp({ quality: preset.quality, lossless: preset.lossless, effort: 6 });
    } else if (safeFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: preset.quality, progressive: true, mozjpeg: true });
    } else if (safeFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: !preset.lossless });
    } else if (safeFormat === 'avif') {
      pipeline = pipeline.avif({ quality: preset.quality, lossless: preset.lossless, effort: 6 });
    } else {
      throw new Error(`Unsupported output format: ${safeFormat}`);
    }

    await pipeline.toFile(outPath);
    const optimisedStat = fs.statSync(outPath);
    const saved = originalStat.size - optimisedStat.size;
    const savedPercent = originalStat.size > 0 ? (saved / originalStat.size) * 100 : 0;

    results.push({
      file,
      output: outPath,
      name: path.basename(file),
      outputName: path.basename(outPath),
      originalBytes: originalStat.size,
      optimisedBytes: optimisedStat.size,
      originalSize: formatBytes(originalStat.size),
      optimisedSize: formatBytes(optimisedStat.size),
      savedBytes: saved,
      savedSize: formatBytes(Math.max(0, saved)),
      savedPercent: Number(savedPercent.toFixed(1)),
      status: saved >= 0 ? 'Optimised' : 'Larger than original'
    });
  }

  const totalOriginal = results.reduce((sum, item) => sum + item.originalBytes, 0);
  const totalOptimised = results.reduce((sum, item) => sum + item.optimisedBytes, 0);
  const totalSaved = totalOriginal - totalOptimised;

  return {
    outputFolder,
    results,
    totals: {
      originalBytes: totalOriginal,
      optimisedBytes: totalOptimised,
      savedBytes: totalSaved,
      originalSize: formatBytes(totalOriginal),
      optimisedSize: formatBytes(totalOptimised),
      savedSize: formatBytes(Math.max(0, totalSaved)),
      savedPercent: totalOriginal > 0 ? Number(((totalSaved / totalOriginal) * 100).toFixed(1)) : 0
    }
  };
});
