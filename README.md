# Image Alignment Menu

Adds quick controls for image alignment in a vault that uses `alt` markers such as `left` and `right` in image embeds.

## Usage

- Right-click an image in live preview and choose `图片左对齐`, `图片居中`, or `图片右对齐`.
- Use commands from the command palette:
  - `Set current image left aligned`
  - `Set current image centered`
  - `Set current image right aligned`
- Default hotkeys:
  - `Ctrl/Cmd+Alt+Left`: left align the image on the current line.
  - `Ctrl/Cmd+Alt+Down`: center the image on the current line.
  - `Ctrl/Cmd+Alt+Right`: right align the image on the current line.
- Set the global default alignment in the plugin settings. Images without an explicit `left`, `right`, or `center` marker use that default.

The plugin edits image Markdown directly. Wiki embeds become values such as `![[image.png|left]]`; standard Markdown images become values such as `![alt|right](image.png)`.

## Development

```powershell
pnpm install
pnpm run build
```
