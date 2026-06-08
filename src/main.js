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

const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const outputFormats = new Set(['jpeg', 'png', 'webp', 'avif']);

function isImage(filePath) {
  return allowedExt.has(path.extname(filePath).toLowerCase());
}

function scanInputPath(inputPath, found = []) {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) return found;

    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(inputPath, { withFileTypes: true });
      for (const entry of entries) {
        scanInputPath(path.join(inputPath, entry.name), found);
      }
      return found;
    }

    if (stat.isFile() && isImage(inputPath)) {
      found.push(inputPath);
    }
  } catch (_error) {
    return found;
  }

  return found;
}

function scanInputPathDetails(inputPath, sourceFolder = null, found = []) {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) return found;

    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      const rootFolder = sourceFolder || inputPath;
      const entries = fs.readdirSync(inputPath, { withFileTypes: true });
      for (const entry of entries) {
        scanInputPathDetails(path.join(inputPath, entry.name), rootFolder, found);
      }
      return found;
    }

    if (stat.isFile() && isImage(inputPath)) {
      found.push({
        file: inputPath,
        sourceFolder: sourceFolder || path.dirname(inputPath)
      });
    }
  } catch (_error) {
    return found;
  }

  return found;
}

function resolveInputPaths(inputPaths = []) {
  const seen = new Set();
  const resolved = [];

  for (const inputPath of inputPaths) {
    const matches = scanInputPath(inputPath);
    for (const filePath of matches) {
      const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(filePath);
    }
  }

  return resolved;
}

function resolveInputPathDetails(inputPaths = []) {
  const seen = new Set();
  const rows = [];

  for (const inputPath of inputPaths) {
    const matches = scanInputPathDetails(inputPath);
    for (const row of matches) {
      const key = normalisePathKey(row.file);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

function normalisePathKey(filePath) {
  return process.platform === 'win32' ? String(filePath).toLowerCase() : String(filePath);
}

function resolveSourceOutputFolder(files = []) {
  const folders = new Map();

  for (const file of files) {
    const folder = path.dirname(file);
    folders.set(normalisePathKey(folder), folder);
  }

  if (folders.size !== 1) return null;
  return path.join(Array.from(folders.values())[0], 'Optimised');
}

function resolveActiveOutputFolder(files, settings) {
  if (settings.useSourceOutputFolder) {
    if (settings.outputFolder) return settings.outputFolder;

    const sourceOutputFolder = resolveSourceOutputFolder(files);
    if (sourceOutputFolder) return sourceOutputFolder;

    return null;
  }

  return settings.outputFolder || null;
}

function resolveOutputPath(file, outputFolder, outputExt, suffix, keepFilename) {
  const parsed = path.parse(file);
  let outPath = path.join(outputFolder, `${parsed.name}${keepFilename ? '' : suffix}${outputExt}`);

  if (normalisePathKey(outPath) === normalisePathKey(file)) {
    const safeSuffix = suffix || '_optimised';
    outPath = path.join(outputFolder, `${parsed.name}${safeSuffix}${outputExt}`);
  }

  return outPath;
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
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
}

ipcMain.handle('select-images', chooseImages);

ipcMain.handle('select-output-folder', chooseOutputFolder);

ipcMain.handle('resolve-input-paths', async (_event, inputPaths = []) => {
  return resolveInputPaths(inputPaths);
});

ipcMain.handle('resolve-input-path-details', async (_event, inputPaths = []) => {
  return resolveInputPathDetails(inputPaths);
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-file-stats', async (_event, filePaths = []) => {
  const rows = resolveInputPaths(filePaths).map(file => {
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
  const files = resolveInputPaths(payload.files || []);
  const settings = payload.settings || {};
  const outputFolder = resolveActiveOutputFolder(files, settings);

  if (!files.length) throw new Error('No supported image files were provided.');
  if (!outputFolder) throw new Error('Please choose an output folder.');

  fs.mkdirSync(outputFolder, { recursive: true });

  const preset = getPresetOptions(settings);
  const results = [];

  for (const file of files) {
    const safeFormat = resolveOutputFormat(preset.format);
    const outputExt = extensionForFormat(safeFormat);
    const outPath = resolveOutputPath(file, outputFolder, outputExt, preset.suffix, settings.keepFilename);

    try {
      const originalStat = fs.statSync(file);
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
        status: saved >= 0 ? 'Optimised' : 'Skipped'
      });
    } catch (error) {
      const originalBytes = fs.existsSync(file) ? fs.statSync(file).size : 0;

      results.push({
        file,
        output: file,
        name: path.basename(file),
        outputName: path.basename(file),
        originalBytes,
        optimisedBytes: 0,
        originalSize: formatBytes(originalBytes),
        optimisedSize: '0 B',
        savedBytes: 0,
        savedSize: '0 B',
        savedPercent: 0,
        status: 'Failed',
        error: error.message || 'Optimisation failed.'
      });
    }
  }

  const completedResults = results.filter(item => item.status !== 'Failed');
  const failedCount = results.length - completedResults.length;
  const totalOriginal = results.reduce((sum, item) => sum + item.originalBytes, 0);
  const totalOptimised = completedResults.reduce((sum, item) => sum + item.optimisedBytes, 0);
  const totalSaved = completedResults.reduce((sum, item) => sum + item.savedBytes, 0);
  const averageReduction = completedResults.length
    ? completedResults.reduce((sum, item) => sum + Math.max(0, item.savedPercent), 0) / completedResults.length
    : 0;

  return {
    outputFolder,
    results,
    totals: {
      processedCount: results.length,
      failedCount,
      originalBytes: totalOriginal,
      optimisedBytes: totalOptimised,
      savedBytes: totalSaved,
      originalSize: formatBytes(totalOriginal),
      optimisedSize: formatBytes(totalOptimised),
      savedSize: formatBytes(Math.max(0, totalSaved)),
      savedPercent: totalOriginal > 0 ? Number(((totalSaved / totalOriginal) * 100).toFixed(1)) : 0,
      averageReduction: Number(averageReduction.toFixed(1))
    }
  };
});
