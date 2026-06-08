# ImageForge Optimiser

A drag-and-drop desktop image optimiser for ForgeWorks Studio.

## Development

```bash
npm install
npm start
```

## Build a standalone Windows installer

Double-click:

```text
build-installer.bat
```

Or run manually:

```bash
npm install
npm run dist:win
```

The built files will appear in:

```text
release/
```

You should get:

- `ImageForge Optimiser-1.0.0-win-x64.exe` installer
- a portable `.exe` build

## Presets

- Archive: lossless output, best quality, larger files
- Portfolio: WebP/JPEG style output, visually clean, good for websites
- Social: smaller files for quick upload and sharing
- Custom: manual quality, dimensions, suffix and format

## Important note

True artefact-free compression means lossless compression. The Portfolio and Social presets are visually optimised, but technically lossy if using JPEG/WebP/AVIF quality settings.
