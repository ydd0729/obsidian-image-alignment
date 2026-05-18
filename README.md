# Image Alignment

Adds quick controls for image alignment in a vault that uses `alt` markers such as `left` and `right` in image embeds.

## Usage

- Right-click an image in live preview and choose `Align image left`, `Align image center`, or `Align image right`.
- Use commands from the command palette:
  - `Set current image left aligned`
  - `Set current image centered`
  - `Set current image right aligned`
- Default hotkeys:
- `Ctrl/Cmd+Alt+Shift+Left`: left align the image on the current line.
- `Ctrl/Cmd+Alt+Shift+Down`: center the image on the current line.
- `Ctrl/Cmd+Alt+Shift+Right`: right align the image on the current line.
- Set the global default alignment in the plugin settings. Images without an explicit `left`, `right`, or `center` marker use that default.

The plugin edits image Markdown directly. Wiki embeds become values such as `![[image.png|left|300]]`; standard Markdown images become values such as `![right|alt](image.png)`. Existing image size markers are preserved.

## Development

```powershell
pnpm install
pnpm run build
```
