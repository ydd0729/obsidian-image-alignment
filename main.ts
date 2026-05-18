import {
  App,
  Editor,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
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
  language: PluginLanguage;
}

const DEFAULT_SETTINGS: ImageAlignmentSettings = {
  defaultAlignment: "center",
  language: "en"
};

const WIKI_IMAGE_PATTERN = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const ALIGNMENT_TOKENS = new Set(["left", "right", "center"]);

export default class ImageAlignmentPlugin extends Plugin {
  settings: ImageAlignmentSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ImageAlignmentSettingTab(this.app, this));
    this.applyDefaultAlignmentClass();

    this.addCommand({
      id: "align-current-image-left",
      name: this.getText().commandLeft,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowLeft" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "left")
    });

    this.addCommand({
      id: "align-current-image-center",
      name: this.getText().commandCenter,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowDown" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "center")
    });

    this.addCommand({
      id: "align-current-image-right",
      name: this.getText().commandRight,
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowRight" }],
      editorCallback: (editor) => this.alignSelectedOrCurrentImage(editor, "right")
    });

    this.registerDomEvent(
      document,
      "contextmenu",
      (event) => this.handleImageContextMenu(event),
      true
    );
  }

  onunload(): void {
    this.clearDefaultAlignmentClasses();
  }

  private alignSelectedOrCurrentImage(editor: Editor, alignment: ImageAlignment): void {
    const selectedTarget = findImageInSelection(editor);
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
  }

  private handleImageContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const imageElement = target.closest(".image-embed, .internal-embed.image-embed, img");
    if (!imageElement || !this.isInMarkdownContent(imageElement)) {
      return;
    }

    const imageTarget =
      this.findImageTargetFromMouseEvent(event) ??
      this.findImageTargetFromElement(imageElement);
    if (!imageTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();
    for (const alignment of ["left", "center", "right"] as const) {
      menu.addItem((item) => {
        item
          .setTitle(this.getText().menuTitle(alignment))
          .onClick(() => this.alignImageTarget(imageTarget, alignment));
      });
    }
    menu.showAtMouseEvent(event);
  }

  private isInMarkdownContent(element: Element): boolean {
    return Boolean(element.closest(".markdown-source-view, .markdown-preview-view"));
  }

  private findImageTargetFromMouseEvent(event: MouseEvent): ImageTarget | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return null;
    }

    const position = getEditorPositionFromMouseEvent(view.editor, event);
    if (!position) {
      return null;
    }

    const line = view.editor.getLine(position.line);
    const match = findImageNearPosition(line, position.ch);
    if (!match) {
      return null;
    }

    return {
      editor: view.editor,
      line: position.line,
      match
    };
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

  private alignImageTarget(target: ImageTarget, alignment: ImageAlignment): void {
    target.editor.replaceRange(
      setImageAlignment(target.match.value, alignment, this.settings.defaultAlignment),
      { line: target.line, ch: target.match.from },
      { line: target.line, ch: target.match.to }
    );
    this.showAlignedNotice(alignment);
  }

  private showAlignedNotice(alignment: ImageAlignment): void {
    new Notice(this.getText().alignedNotice(alignment));
  }

  getText(): PluginText {
    return PLUGIN_TEXT[this.settings.language];
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
}

class ImageAlignmentSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ImageAlignmentPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(this.plugin.getText().languageName)
      .setDesc(this.plugin.getText().languageDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("en", "English")
          .addOption("zh", "中文")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as PluginLanguage;
            await this.plugin.saveSettings();
            this.display();
          });
      });

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
  languageDesc: string;
  languageName: string;
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
    languageDesc: "Controls the plugin menus, settings, commands, and notices.",
    languageName: "Language",
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
    languageDesc: "控制插件菜单、设置、命令和通知的显示语言。",
    languageName: "语言",
    menuTitle: (alignment) => `图片${PLUGIN_TEXT.zh.alignmentLabels[alignment]}`,
    noImage: "当前选区或光标所在行没有可设置对齐的图片。"
  }
};

function getEditorPositionFromMouseEvent(
  editor: Editor,
  event: MouseEvent
): { line: number; ch: number } | null {
  const codeMirrorView = (editor as unknown as { cm?: CodeMirrorPositionView }).cm;
  if (!codeMirrorView) {
    return editor.getCursor();
  }

  const offset = codeMirrorView?.posAtCoords({
    x: event.clientX,
    y: event.clientY
  });

  if (typeof offset !== "number") {
    return editor.getCursor();
  }

  const line = codeMirrorView.state.doc.lineAt(offset);
  return {
    line: line.number - 1,
    ch: offset - line.from
  };
}

interface CodeMirrorPositionView {
  state: {
    doc: {
      lineAt(offset: number): { number: number; from: number };
    };
  };
  posAtCoords(coords: { x: number; y: number }): number | null;
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
    modifiers.push(alignment);
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
    alt.push(alignment);
  }

  return `![${alt.join("|")}](${match[2]})`;
}

function removeAlignmentTokens(values: string[]): string[] {
  return values.filter((value) => !ALIGNMENT_TOKENS.has(value.trim().toLowerCase()));
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
