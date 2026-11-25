export type LocalFileOpenActions = {
  activateLocalDesktop: () => void;
  showMarkWisely: () => void;
  openMarkdown: (path: string) => Promise<void>;
  showEditorWisely: () => void;
  openText: (path: string) => Promise<void>;
};

export async function openLocalFileInDesktop(path: string, actions: LocalFileOpenActions): Promise<void> {
  actions.activateLocalDesktop();
  if (isMarkdownPath(path)) {
    actions.showMarkWisely();
    await actions.openMarkdown(path);
  } else {
    actions.showEditorWisely();
    await actions.openText(path);
  }
}

export function isMarkdownPath(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path);
}
