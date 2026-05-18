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

const ALIGNMENT_LABELS: Record<ImageAlignment, string> = {
  center: "居中",
  left: "左对齐",
  right: "右对齐"
};

const DEFAULT_SETTINGS: ImageAlignmentSettings = {
  defaultAlignment: "center"
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
      name: "Set current image left aligned",
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowLeft" }],
      editorCallback: (editor) => this.alignImageAtCursor(editor, "left")
    });

    this.addCommand({
      id: "align-current-image-center",
      name: "Set current image centered",
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowDown" }],
      editorCallback: (editor) => this.alignImageAtCursor(editor, "center")
    });

    this.addCommand({
      id: "align-current-image-right",
      name: "Set current image right aligned",
      hotkeys: [{ modifiers: ["Mod", "Alt", "Shift"], key: "ArrowRight" }],
      editorCallback: (editor) => this.alignImageAtCursor(editor, "right")
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

  private alignImageAtCursor(editor: Editor, alignment: ImageAlignment): void {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const match = findImageNearPosition(line, cursor.ch);

    if (!match) {
      new Notice("当前光标所在行没有可设置对齐的图片。");
      return;
    }

    editor.replaceRange(
      setImageAlignment(match.value, alignment, this.settings.defaultAlignment),
      { line: cursor.line, ch: match.from },
      { line: cursor.line, ch: match.to }
    );
    new Notice(`图片已设置为${ALIGNMENT_LABELS[alignment]}。`);
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

    const imageTarget = this.findImageTargetFromMouseEvent(event);
    if (!imageTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();
    for (const alignment of ["left", "center", "right"] as const) {
      menu.addItem((item) => {
        item
          .setTitle(`图片${ALIGNMENT_LABELS[alignment]}`)
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

  private alignImageTarget(target: ImageTarget, alignment: ImageAlignment): void {
    target.editor.replaceRange(
      setImageAlignment(target.match.value, alignment, this.settings.defaultAlignment),
      { line: target.line, ch: target.match.from },
      { line: target.line, ch: target.match.to }
    );
    new Notice(`图片已设置为${ALIGNMENT_LABELS[alignment]}。`);
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
      .setName("默认图片对齐")
      .setDesc("没有显式对齐标记的图片会使用这个默认值。")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("center", "居中")
          .addOption("left", "左对齐")
          .addOption("right", "右对齐")
          .setValue(this.plugin.settings.defaultAlignment)
          .onChange(async (value) => {
            this.plugin.settings.defaultAlignment = value as ImageAlignment;
            await this.plugin.saveSettings();
          });
      });
  }
}

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
