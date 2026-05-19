# Image Alignment

Image Alignment adds quick alignment controls for images in Markdown notes. It works by editing the image embed text directly, so your notes stay portable and readable without the plugin.

## Features

- Align images left, center, or right from the image context menu.
- Align the selected image with commands and default hotkeys.
- Set a default alignment for images that do not have an explicit alignment marker.
- Preserve existing image size markers such as `|300` when changing alignment.

## Usage

Right-click an image in Live Preview and choose one of:

- `Align image left`
- `Align image center`
- `Align image right`

You can also run these commands from the command palette:

- `Image Alignment: Set current image left aligned`
- `Image Alignment: Set current image centered`
- `Image Alignment: Set current image right aligned`

Default hotkeys:

- `Ctrl/Cmd + Alt + Shift + Left`: align the selected or current image left
- `Ctrl/Cmd + Alt + Shift + Down`: align the selected or current image center
- `Ctrl/Cmd + Alt + Shift + Right`: align the selected or current image right

To change the hotkeys, use Obsidian's built-in **Settings -> Hotkeys** page and search for `Image Alignment`.

## How Alignment Is Stored

The plugin stores alignment as an image alt marker:

```md
![[image.png|left]]
![[image.png|center|300]]
![[image.png|right|500x300]]
![left|caption|300](image.png)
```

If an image already has a size marker, the alignment marker is inserted before the size marker so Obsidian can still recognize the size.

When an image matches the default alignment configured in the plugin settings, the explicit alignment marker is removed. The plugin's CSS then applies the default alignment while the plugin is enabled.

## Settings

- **Default image alignment**: Choose the alignment used for images without an explicit `left`, `center`, or `right` marker.

## Notes And Limitations

- The plugin is designed for Markdown image embeds and standard Markdown image links.
- The context menu integration targets rendered images in Live Preview and Reading view.
- Alignment is implemented with CSS classes and Markdown alt markers. If you disable the plugin, explicit markers remain in your Markdown, but the default alignment setting no longer applies.

## Privacy

Image Alignment runs entirely inside your vault. It does not use network access, telemetry, ads, accounts, or external services.

## Installation

After the plugin is published, install it from **Settings -> Community plugins -> Browse** and search for `Image Alignment`.

For manual installation, copy these files into `.obsidian/plugins/image-alignment/`:

- `manifest.json`
- `main.js`
- `styles.css`

Then enable `Image Alignment` from **Settings -> Community plugins**.

## Support

If you find a bug, include:

- The image Markdown before and after alignment
- Whether you used the context menu, a command, or a hotkey
- Your Obsidian version

## Development

```powershell
pnpm install
pnpm run build
```
