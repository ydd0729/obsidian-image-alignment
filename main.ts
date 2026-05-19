import {
  App,
  Editor,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  getLanguage,
} from "obsidian";

type ImageAlignment = "center" | "left" | "right";
type PluginLanguage = "en" | "zh";

interface ImageMatch {
  from: number;
  to: number;
  value: string;
}

interface ImageTarget {
  editor: Editor;
  line: number;
  match: ImageMatch;
}

interface ImageAlignmentSettings {
  defaultAlignment: ImageAlignment;
}

const DEFAULT_SETTINGS: ImageAlignmentSettings = {
  defaultAlignment: "center"
};

const WIKI_IMAGE_PATTERN = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const ALIGNMENT_TOKENS = new Set(["left", "right", "center"]);

export default class ImageAlignmentPlugin extends Plugin {
  settings: ImageAlignmentSettings = DEFAULT_SETTINGS;
  private selectedImageElement: Element | null = null;
  private livePreviewObserver: MutationObserver | null = null;
  private syncLivePreviewTimeout: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ImageAlignmentSettingTab(this.app, this));
    this.applyDefaultAlignmentClass();
    this.startLivePreviewAlignmentSync();
    this.registerAlignmentCommands();

    this.registerDomEvent(document, "contextmenu", (event) => this.captureImageContextMenu(event), true);
    this.registerDomEvent(document, "mousedown", (event) => this.captureSelectedImage(event), true);
  }

  onunload(): void {
    this.stopLivePreviewAlignmentSync();
    this.clearLivePreviewAlignmentClasses();
    this.clearDefaultAlignmentClasses();
  }

  private alignSelectedOrCurrentImage(editor: Editor, alignment: ImageAlignment): void {
    const selectedTarget =
      this.findImageTargetFromSelectedElement() ??
      findImageInSelection(editor);
    if (selectedTarget) {
      this.alignImageTarget(selectedTarget, alignment);
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const match = findImageNearPosition(line, cursor.ch);

    if (!match) {
      new Notice(this.getText().noImage);
      return;
    }

    editor.replaceRange(
      setImageAlignment(match.value, alignment, this.settings.defaultAlignment),
      { line: cursor.line, ch: match.from },
      { line: cursor.line, ch: match.to }
    );
    this.showAlignedNotice(alignment);
    this.scheduleLivePreviewAlignmentSync();
  }

  private captureImageContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const imageElement = target.closest(".image-embed, .internal-embed.image-embed, img");
    if (!imageElement || !this.isInMarkdownContent(imageElement)) {
      return;
    }

    const imageTarget = this.findImageTargetFromElement(imageElement);
    if (!imageTarget) {
      return;
    }

    const menu = Menu.forEvent(event);
    menu.addSeparator();
    for (const alignment of ["left", "center", "right"] as const) {
      menu.addItem((item) => {
        item
          .setTitle(this.getText().menuTitle(alignment))
          .onClick(() => this.alignImageTarget(imageTarget, alignment));
      });
    }
  }

  private captureSelectedImage(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const imageElement = target.closest(".image-embed, .internal-embed.image-embed, img");
    this.selectedImageElement =
      imageElement && this.isInMarkdownContent(imageElement)
        ? imageElement
        : null;
  }

  private isInMarkdownContent(element: Element): boolean {
    return Boolean(element.closest(".markdown-source-view, .markdown-preview-view"));
  }

  private findImageTargetFromElement(element: Element): ImageTarget | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const imageSource = getImageSourceFromElement(element);
    if (!view || !imageSource) {
      return null;
    }

    for (let lineNumber = 0; lineNumber < view.editor.lineCount(); lineNumber += 1) {
      const line = view.editor.getLine(lineNumber);
      const match = findImagesInLine(line).find((candidate) =>
        imageMatchHasSource(candidate.value, imageSource)
      );
      if (match) {
        return {
          editor: view.editor,
          line: lineNumber,
          match
        };
      }
    }

    return null;
  }

  private findImageTargetFromSelectedElement(): ImageTarget | null {
    if (!this.selectedImageElement || !this.selectedImageElement.isConnected) {
      return null;
    }

    return this.findImageTargetFromElement(this.selectedImageElement);
  }

  private alignImageTarget(target: ImageTarget, alignment: ImageAlignment): void {
    target.editor.replaceRange(
      setImageAlignment(target.match.value, alignment, this.settings.defaultAlignment),
      { line: target.line, ch: target.match.from },
      { line: target.line, ch: target.match.to }
    );
    this.showAlignedNotice(alignment);
    this.scheduleLivePreviewAlignmentSync();
  }

  private showAlignedNotice(alignment: ImageAlignment): void {
    new Notice(this.getText().alignedNotice(alignment));
  }

  getText(): PluginText {
    return PLUGIN_TEXT[getPluginLanguage()];
  }

  registerAlignmentCommands(): void {
    for (const alignment of ["left", "center", "right"] as const) {
      this.removeCommand(getAlignmentCommandId(alignment));
    }

    this.addCommand({
      id: getAlignmentCommandId("left"),
      name: this.getText().commandLeft,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowLeft" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "left")
    });

    this.addCommand({
      id: getAlignmentCommandId("center"),
      name: this.getText().commandCenter,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowDown" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "center")
    });

    this.addCommand({
      id: getAlignmentCommandId("right"),
      name: this.getText().commandRight,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowRight" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "right")
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyDefaultAlignmentClass();
    this.scheduleLivePreviewAlignmentSync();
    this.registerAlignmentCommands();
  }

  applyDefaultAlignmentClass(): void {
    this.clearDefaultAlignmentClasses();
    document.body.classList.add(`image-alignment-default-${this.settings.defaultAlignment}`);
  }

  private clearDefaultAlignmentClasses(): void {
    for (const alignment of ["center", "left", "right"] as const) {
      document.body.classList.remove(`image-alignment-default-${alignment}`);
      document.body.classList.remove(`image-alignment-menu-default-${alignment}`);
    }
  }

  private startLivePreviewAlignmentSync(): void {
    this.livePreviewObserver = new MutationObserver(() => this.scheduleLivePreviewAlignmentSync());
    this.livePreviewObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["alt"],
      childList: true,
      subtree: true
    });
    this.scheduleLivePreviewAlignmentSync();
  }

  private stopLivePreviewAlignmentSync(): void {
    this.livePreviewObserver?.disconnect();
    this.livePreviewObserver = null;
    if (this.syncLivePreviewTimeout !== null) {
      window.clearTimeout(this.syncLivePreviewTimeout);
      this.syncLivePreviewTimeout = null;
    }
  }

  private scheduleLivePreviewAlignmentSync(): void {
    if (this.syncLivePreviewTimeout !== null) {
      return;
    }

    this.syncLivePreviewTimeout = window.setTimeout(() => {
      this.syncLivePreviewTimeout = null;
      this.syncLivePreviewAlignmentClasses();
    }, 0);
  }

  private syncLivePreviewAlignmentClasses(): void {
    const blocks = document.querySelectorAll(
      ".markdown-source-view.mod-cm6.is-live-preview .cm-embed-block"
    );

    for (const block of Array.from(blocks)) {
      const imageEmbed = block.querySelector(".image-embed");
      if (!imageEmbed) {
        clearElementAlignmentClasses(block);
        continue;
      }

      setElementAlignmentClass(block, getElementAlignment(imageEmbed, this.settings.defaultAlignment));
    }
  }

  private clearLivePreviewAlignmentClasses(): void {
    const blocks = document.querySelectorAll(
      ".markdown-source-view.mod-cm6.is-live-preview .cm-embed-block"
    );

    for (const block of Array.from(blocks)) {
      clearElementAlignmentClasses(block);
    }
  }
}

class ImageAlignmentSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ImageAlignmentPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(this.plugin.getText().defaultAlignmentName)
      .setDesc(this.plugin.getText().defaultAlignmentDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("center", this.plugin.getText().alignmentLabels.center)
          .addOption("left", this.plugin.getText().alignmentLabels.left)
          .addOption("right", this.plugin.getText().alignmentLabels.right)
          .setValue(this.plugin.settings.defaultAlignment)
          .onChange(async (value) => {
            this.plugin.settings.defaultAlignment = value as ImageAlignment;
            await this.plugin.saveSettings();
          });
      });
  }
}

interface PluginText {
  alignmentLabels: Record<ImageAlignment, string>;
  alignedNotice(alignment: ImageAlignment): string;
  commandCenter: string;
  commandLeft: string;
  commandRight: string;
  defaultAlignmentDesc: string;
  defaultAlignmentName: string;
  menuTitle(alignment: ImageAlignment): string;
  noImage: string;
}

const PLUGIN_TEXT: Record<PluginLanguage, PluginText> = {
  en: {
    alignmentLabels: {
      center: "Center",
      left: "Left",
      right: "Right"
    },
    alignedNotice: (alignment) =>
      `Image alignment set to ${PLUGIN_TEXT.en.alignmentLabels[alignment].toLowerCase()}.`,
    commandCenter: "Set current image centered",
    commandLeft: "Set current image left aligned",
    commandRight: "Set current image right aligned",
    defaultAlignmentDesc: "Images without an explicit alignment marker use this default.",
    defaultAlignmentName: "Default image alignment",
    menuTitle: (alignment) => `Align image ${PLUGIN_TEXT.en.alignmentLabels[alignment].toLowerCase()}`,
    noImage: "No image found on the current selection or cursor line."
  },
  zh: {
    alignmentLabels: {
      center: "居中",
      left: "左对齐",
      right: "右对齐"
    },
    alignedNotice: (alignment) => `图片已设置为${PLUGIN_TEXT.zh.alignmentLabels[alignment]}。`,
    commandCenter: "将当前图片居中",
    commandLeft: "将当前图片左对齐",
    commandRight: "将当前图片右对齐",
    defaultAlignmentDesc: "没有显式对齐标记的图片会使用这个默认值。",
    defaultAlignmentName: "默认图片对齐",
    menuTitle: (alignment) => `图片${PLUGIN_TEXT.zh.alignmentLabels[alignment]}`,
    noImage: "当前选区或光标所在行没有可设置对齐的图片。"
  }
};

function getPluginLanguage(): PluginLanguage {
  return getLanguage().toLowerCase().startsWith("zh") ? "zh" : "en";
}

function findImageNearPosition(line: string, ch: number): ImageMatch | null {
  const matches = findImagesInLine(line);
  if (matches.length === 0) {
    return null;
  }

  const containing = matches.find((match) => match.from <= ch && ch <= match.to);
  if (containing) {
    return containing;
  }

  return matches.reduce((nearest, match) => {
    const nearestDistance = distanceToRange(ch, nearest.from, nearest.to);
    const matchDistance = distanceToRange(ch, match.from, match.to);
    return matchDistance < nearestDistance ? match : nearest;
  });
}

function findImagesInLine(line: string): ImageMatch[] {
  const matches: ImageMatch[] = [];

  for (const match of line.matchAll(WIKI_IMAGE_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      value: match[0]
    });
  }

  for (const match of line.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      value: match[0]
    });
  }

  return matches.sort((a, b) => a.from - b.from);
}

function findImageInSelection(editor: Editor): ImageTarget | null {
  const selection = editor.getSelection();
  if (!selection) {
    return null;
  }

  const from = editor.getCursor("from");
  const selectedLines = selection.split(/\r?\n/);
  for (let lineOffset = 0; lineOffset < selectedLines.length; lineOffset += 1) {
    const matches = findImagesInLine(selectedLines[lineOffset]);
    const match = matches[0];
    if (!match) {
      continue;
    }

    const line = from.line + lineOffset;
    const chOffset = lineOffset === 0 ? from.ch : 0;
    return {
      editor,
      line,
      match: {
        from: chOffset + match.from,
        to: chOffset + match.to,
        value: match.value
      }
    };
  }

  return null;
}

function distanceToRange(ch: number, from: number, to: number): number {
  if (ch < from) {
    return from - ch;
  }
  if (ch > to) {
    return ch - to;
  }
  return 0;
}

function getAlignmentCommandId(alignment: ImageAlignment): string {
  return `align-current-image-${alignment}`;
}

function setImageAlignment(
  markdown: string,
  alignment: ImageAlignment,
  defaultAlignment: ImageAlignment
): string {
  if (markdown.startsWith("![[")) {
    return setWikiImageAlignment(markdown, alignment, defaultAlignment);
  }
  return setMarkdownImageAlignment(markdown, alignment, defaultAlignment);
}

function setWikiImageAlignment(
  markdown: string,
  alignment: ImageAlignment,
  defaultAlignment: ImageAlignment
): string {
  const inner = markdown.slice(3, -2);
  const parts = inner.split("|");
  const target = parts.shift() ?? "";
  const modifiers = removeAlignmentTokens(parts);

  if (alignment !== defaultAlignment) {
    modifiers.unshift(alignment);
  }

  return modifiers.length > 0
    ? `![[${[target, ...modifiers].join("|")}]]`
    : `![[${target}]]`;
}

function setMarkdownImageAlignment(
  markdown: string,
  alignment: ImageAlignment,
  defaultAlignment: ImageAlignment
): string {
  const match = markdown.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!match) {
    return markdown;
  }

  const altParts = match[1].split("|").filter((part) => part.length > 0);
  const alt = removeAlignmentTokens(altParts);
  if (alignment !== defaultAlignment) {
    alt.unshift(alignment);
  }

  return `![${alt.join("|")}](${match[2]})`;
}

function removeAlignmentTokens(values: string[]): string[] {
  return values.filter((value) => !ALIGNMENT_TOKENS.has(value.trim().toLowerCase()));
}

function getElementAlignment(element: Element, defaultAlignment: ImageAlignment): ImageAlignment {
  const explicitAlignment = getExplicitAlignmentFromAlt(element.getAttribute("alt") ?? "");
  return explicitAlignment ?? defaultAlignment;
}

function getExplicitAlignmentFromAlt(alt: string): ImageAlignment | null {
  for (const token of alt.split("|")) {
    const normalizedToken = token.trim().toLowerCase();
    if (isImageAlignment(normalizedToken)) {
      return normalizedToken;
    }
  }

  return null;
}

function isImageAlignment(value: string): value is ImageAlignment {
  return ALIGNMENT_TOKENS.has(value);
}

function setElementAlignmentClass(element: Element, alignment: ImageAlignment): void {
  if (getElementAlignmentClass(element) === alignment) {
    return;
  }

  clearElementAlignmentClasses(element);
  element.classList.add(`image-alignment-live-preview-${alignment}`);
}

function getElementAlignmentClass(element: Element): ImageAlignment | null {
  for (const alignment of ["center", "left", "right"] as const) {
    if (element.classList.contains(`image-alignment-live-preview-${alignment}`)) {
      return alignment;
    }
  }

  return null;
}

function clearElementAlignmentClasses(element: Element): void {
  for (const alignment of ["center", "left", "right"] as const) {
    element.classList.remove(`image-alignment-live-preview-${alignment}`);
  }
}

function getImageSourceFromElement(element: Element): string | null {
  const embed = element.closest(".image-embed") ?? element;
  const source = embed.getAttribute("src") ?? element.getAttribute("src");
  if (!source) {
    return null;
  }

  return decodeURIComponent(source)
    .replace(/^app:\/\/[^/]+\//, "")
    .replace(/^.*[\\/](?=attachments[\\/])/, "")
    .replace(/\\/g, "/");
}

function imageMatchHasSource(markdown: string, imageSource: string): boolean {
  return getImageSourceFromMarkdown(markdown) === imageSource;
}

function getImageSourceFromMarkdown(markdown: string): string | null {
  if (markdown.startsWith("![[")) {
    const inner = markdown.slice(3, -2);
    const target = inner.split("|")[0] ?? "";
    return target.replace(/\\/g, "/");
  }

  const match = markdown.match(/^!\[[^\]]*]\(([^)]+)\)$/);
  return match ? match[1].replace(/\\/g, "/") : null;
}
