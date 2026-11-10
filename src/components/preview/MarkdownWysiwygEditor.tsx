import { useEffect, useRef, useState } from "react";
import Vditor from "vditor";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import "vditor/dist/index.css";
import { useTranslation } from "react-i18next";
import { getAppTheme, subscribeAppTheme, type AppTheme } from "../../lib/appTheme";
import {
  registerPreviewEditorFlush,
  unregisterPreviewEditorFlush,
} from "../../lib/previewEditorFlush";
import {
  markdownImageDestination,
  joinMarkdownImagePath,
  joinMarkdownImagesDirectoryPath,
  parentRemoteDir,
  resolveMarkdownImageSrc,
} from "../../lib/markdownImagePath";
import {
  readPreviewRemoteBytes,
  uniquePasteImageName,
  writePreviewRemoteBytes,
} from "../../lib/previewRemoteBytes";
import i18n from "../../i18n";
import { createLocalPath, writeLocalBytes } from "../../lib/localFsApi";
import { listLocalDirectory, parentLocalPath } from "../../lib/localFsApi";
import type { ListLocalDirectoryResult } from "../../types";
import { MarkWiselyCompatibilityNode } from "./MarkWiselyCompatibilityNode";
import { MarkWiselyFormatContextMenu, type MarkWiselyFormatCommand } from "./MarkWiselyFormatContextMenu";
import {
  createRoundTripDocument,
  projectRoundTripDocument,
  restoreRoundTripProjection,
  type MarkdownCompatibilityAnchor,
  type MarkdownRoundTripDocument,
  type MarkdownRoundTripProjection,
} from "../../lib/markdownSourceRoundTrip";

export interface MarkdownWysiwygEditorProps {
  tabId: string;
  sessionId?: string;
  localFileSystem?: boolean;
  preserveCompatibility?: boolean;
  viewMode?: "wysiwyg" | "source";
  hideToolbar?: boolean;
  enableContextMenu?: boolean;
  storeClipboardImages?: boolean;
  filePath: string;
  text: string;
  editable: boolean;
  typewriterMode?: boolean;
  spellcheck?: boolean;
  onChange?: (value: string) => void;
  toolbarActions?: Array<{
    id: string;
    label: string;
    icon: string;
    onClick: () => void;
  }>;
}

/** Self-hosted assets copied to public/vditor by vite.vditor.ts */
const VDITOR_CDN = "/vditor";

function vditorLang(): "zh_CN" | "en_US" {
  return i18n.language?.toLowerCase().startsWith("zh") ? "zh_CN" : "en_US";
}

function themeFromApp(theme: AppTheme): "dark" | "classic" {
  return theme === "dark" ? "dark" : "classic";
}

async function hydrateRemoteImages(
  root: HTMLElement,
  sessionId: string | undefined,
  localFileSystem: boolean,
  filePath: string,
  blobUrls: string[],
): Promise<void> {
  const imgs = root.querySelectorAll<HTMLImageElement>("img[src]");
  for (const img of imgs) {
    if (img.dataset.twHydrated === "1") continue;
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|blob:|\/\/)/i.test(src)) {
      img.dataset.twHydrated = "1";
      continue;
    }
    const remote = resolveMarkdownImageSrc(filePath, src);
    if (!remote) {
      img.dataset.twHydrated = "1";
      continue;
    }
    if (localFileSystem) {
      img.src = convertFileSrc(remote);
      img.dataset.twHydrated = "1";
      continue;
    }
    if (!sessionId) {
      img.classList.add("preview-md-img-failed");
      img.dataset.twHydrated = "1";
      continue;
    }
    try {
      const { bytes, mime } = await readPreviewRemoteBytes(sessionId, remote);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      blobUrls.push(url);
      img.src = url;
      img.dataset.twHydrated = "1";
    } catch {
      img.classList.add("preview-md-img-failed");
      img.dataset.twHydrated = "1";
    }
  }
}

export function MarkdownWysiwygEditor({
  tabId,
  sessionId,
  localFileSystem = false,
  preserveCompatibility = false,
  viewMode = "wysiwyg",
  hideToolbar = false,
  enableContextMenu = false,
  storeClipboardImages = false,
  filePath,
  text,
  editable,
  typewriterMode = false,
  spellcheck = false,
  onChange,
  toolbarActions,
}: MarkdownWysiwygEditorProps) {
  const { t } = useTranslation("preview");
  const roundTripModel = preserveCompatibility ? createRoundTripDocument(text) : null;
  const projection = roundTripModel ? projectRoundTripDocument(roundTripModel) : null;
  const projectionRef = useRef<{ model: MarkdownRoundTripDocument | null; projection: MarkdownRoundTripProjection | null }>({ model: roundTripModel, projection });
  projectionRef.current = { model: roundTripModel, projection };
  const [activeCompatibilityNode, setActiveCompatibilityNode] = useState<(MarkdownCompatibilityAnchor & { source: string }) | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const textRef = useRef(text);
  const onChangeRef = useRef(onChange);
  const publishChangeRef = useRef<(value: string) => void>(() => undefined);
  const toolbarActionsRef = useRef(toolbarActions);
  const typewriterModeRef = useRef(typewriterMode);
  const spellcheckRef = useRef(spellcheck);
  const editorGenerationRef = useRef(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [formatContextMenu, setFormatContextMenu] = useState<{ x: number; y: number; disabledCommands: string[] } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  textRef.current = text;
  onChangeRef.current = onChange;
  toolbarActionsRef.current = toolbarActions;
  typewriterModeRef.current = typewriterMode;
  spellcheckRef.current = spellcheck;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (viewMode === "source") {
      unregisterPreviewEditorFlush(tabId);
      return;
    }
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let sizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    let resizeListener: (() => void) | null = null;
    const editorGeneration = ++editorGenerationRef.current;
    const publishChange = (value: string) => {
      if (editorGenerationRef.current !== editorGeneration) return;
      const currentProjection = projectionRef.current;
      if (currentProjection.model && currentProjection.projection) {
        try {
          onChangeRef.current?.(restoreRoundTripProjection(currentProjection.model, currentProjection.projection, value));
        } catch {
          /* A deleted compatibility anchor is restored by putting the last emitted source back into Vditor. */
          const lastSafe = projectRoundTripDocument(createRoundTripDocument(textRef.current)).source;
          vditorRef.current?.setValue(lastSafe);
        }
      } else onChangeRef.current?.(value);
    };
    const handleClipboardPaste = (event: ClipboardEvent) => {
      if (!storeClipboardImages || !editable || !event.clipboardData) return;
      const files = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      void (async () => {
        const parent = localFileSystem ? parentLocalPath(filePath) : parentRemoteDir(filePath);
        const imagesDir = localFileSystem
          ? joinMarkdownImagePath(filePath, "images")
          : parent === "/" ? "/images" : parent === "." ? "images" : `${parent}/images`;
        let existingNames: string[] = [];
        if (localFileSystem) {
          const parentListing = await listLocalDirectory(parent);
          const directoryExists = parentListing.entries.some((entry) => entry.name === "images" && entry.kind === "directory");
          if (!directoryExists) await createLocalPath(parent, "images", "directory");
          else {
            const listing = await listLocalDirectory(imagesDir);
            existingNames = listing.entries.map((entry) => entry.name);
          }
        } else {
          if (!sessionId) throw new Error("An SSH session is required to store this image.");
          const parentListing = await invoke<ListLocalDirectoryResult>("list_remote_directory", { request: { session_id: sessionId, path: parent } });
          const directoryExists = parentListing.entries.some((entry) => entry.name === "images" && entry.kind === "directory");
          if (!directoryExists) await invoke("create_path", { request: { session_id: sessionId, parent_dir: parent, name: "images", kind: "directory", sudo_password: null } });
          else {
            const listing = await invoke<ListLocalDirectoryResult>("list_remote_directory", { request: { session_id: sessionId, path: imagesDir } });
            existingNames = listing.entries.map((entry) => entry.name);
          }
        }
        for (const file of files) {
          const name = uniquePasteImageName(file.name || `paste-${Date.now()}.png`, Date.now(), existingNames);
          existingNames.push(name);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (localFileSystem) await writeLocalBytes(joinMarkdownImagesDirectoryPath(filePath, name), bytes);
          else {
            if (!sessionId) throw new Error("An SSH session is required to store this image.");
            const remotePath = imagesDir === "/" ? `/${name}` : `${imagesDir}/${name}`;
            await writePreviewRemoteBytes(sessionId, remotePath, bytes);
          }
          const destination = markdownImageDestination(`images/${name}`);
          vditorRef.current?.insertValue(`![${name}](${destination})\n`);
        }
        publishChange(vditorRef.current?.getValue() ?? "");
        scheduleHydrate();
      })().catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        vditorRef.current?.tip(message, 3000);
      });
    };
    el.addEventListener("paste", handleClipboardPaste, true);
    publishChangeRef.current = publishChange;
    const currentMarkdownValue = () => {
      const value = vditorRef.current?.getValue() ?? textRef.current;
      const currentProjection = projectionRef.current;
      if (!currentProjection.model || !currentProjection.projection) return value;
      try {
        return restoreRoundTripProjection(currentProjection.model, currentProjection.projection, value);
      } catch {
        return textRef.current;
      }
    };
    const decorateCompatibilityNodes = () => {
      const currentProjection = projectionRef.current.projection;
      if (!currentProjection) return;
      for (const anchor of currentProjection.anchors) {
        for (const code of el.querySelectorAll<HTMLElement>(".vditor-ir code")) {
          if (code.textContent?.trim() !== anchor.token.slice(1, -1)) continue;
          code.classList.add("markwisely-compatibility-anchor");
          code.dataset.twCompatibilityAnchor = anchor.segmentId;
          code.dataset.preview = anchor.preview || anchor.compatibilityKind;
          code.dataset.compatibilityKind = anchor.compatibilityKind;
          code.dataset.testid = "markwisely-compatibility-node";
          code.setAttribute("role", "button");
          code.setAttribute("tabindex", "0");
          code.setAttribute("aria-label", `${anchor.compatibilityKind}: ${anchor.preview}`);
        }
      }
    };
    const openCompatibilityNode = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node = target.closest<HTMLElement>("[data-tw-compatibility-anchor]");
      if (!node) return;
      const anchor = projectionRef.current.projection?.anchors.find((candidate) => candidate.segmentId === node.dataset.twCompatibilityAnchor);
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      const model = projectionRef.current.model;
      const segment = model?.segments.find((candidate) => candidate.id === anchor.segmentId);
      if (segment) setActiveCompatibilityNode({ ...anchor, source: segment.source });
    };
    const centerCaretBlock = () => {
      if (!typewriterModeRef.current) return;
      requestAnimationFrame(() => {
        const content = el.querySelector<HTMLElement>(".vditor-ir .vditor-reset[contenteditable='true']");
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        if (!content || !anchor || !content.contains(anchor)) return;
        const element = anchor instanceof Element ? anchor : anchor.parentElement;
        const block = element?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre");
        block?.scrollIntoView({ block: "center", behavior: "auto" });
      });
    };
    setInitError(null);

    const appTheme = getAppTheme();
    const scheduleHydrate = () => {
      const root = el.querySelector(".vditor-ir") ?? el;
      void hydrateRemoteImages(
        root as HTMLElement,
        sessionId,
        localFileSystem,
        filePath,
        blobUrlsRef.current,
      );
    };
    const syncToolbarTitles = () => {
      for (const button of el.querySelectorAll<HTMLButtonElement>(
        ".markwisely-toolbar-action button[aria-label]",
      )) {
        const label = button.getAttribute("aria-label");
        if (label && button.title !== label) button.title = label;
      }
    };
    const syncSpellcheck = () => {
      for (const input of el.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
        if ((input as HTMLElement & { spellcheck: boolean }).spellcheck !== spellcheckRef.current) {
          (input as HTMLElement & { spellcheck: boolean }).spellcheck = spellcheckRef.current;
        }
      }
    };

    try {
      const vditor = new Vditor(el, {
        cdn: VDITOR_CDN,
        mode: "ir",
        height: "100%",
        width: "100%",
        theme: themeFromApp(appTheme),
        lang: vditorLang(),
        value: projectionRef.current.projection?.source ?? textRef.current,
        cache: { enable: false },
        toolbarConfig: { pin: !hideToolbar, hide: hideToolbar },
        preview: {
          math: { engine: "KaTeX", inlineDigit: true },
          markdown: {
            footnotes: true,
            mark: true,
            codeBlockPreview: true,
            mathBlockPreview: true,
          },
          theme:
            appTheme === "dark"
              ? { current: "dark" }
              : { current: "light" },
        },
        toolbar: [
          ...(toolbarActions ?? []).map((action) => ({
            name: `markwisely-${action.id}`,
            icon: action.icon,
            tip: action.label,
            tipPosition: "s",
            className: `markwisely-toolbar-action markwisely-toolbar-${action.id}`,
            click: (event: Event) => {
              event.preventDefault();
              if (editorGenerationRef.current !== editorGeneration) return;
              toolbarActionsRef.current?.find((item) => item.id === action.id)?.onClick();
            },
          })),
          ...(toolbarActions?.length ? ["|"] : []),
          "headings",
          "bold",
          "italic",
          "strike",
          "|",
          "list",
          "ordered-list",
          "check",
          "outdent",
          "indent",
          "|",
          "quote",
          "line",
          "code",
          "inline-code",
          "insert-before",
          "insert-after",
          "|",
          "table",
          "link",
          "upload",
          "|",
          "undo",
          "redo",
          "outline",
          "fullscreen",
        ],
        upload: {
          accept: "image/*",
          multiple: true,
          handler: (files: File[]) => {
            void (async () => {
              const dir = parentRemoteDir(filePath);
              let existingNames: string[];
              if (localFileSystem) {
                const listing = await listLocalDirectory(parentLocalPath(filePath));
                existingNames = listing.entries.map((entry) => entry.name);
              } else {
                if (!sessionId) throw new Error("An SSH session is required to store this image.");
                const listing = await invoke<ListLocalDirectoryResult>("list_remote_directory", {
                  request: { session_id: sessionId, path: dir },
                });
                existingNames = listing.entries.map((entry) => entry.name);
              }
              for (const file of files) {
                const name = uniquePasteImageName(file.name, Date.now(), existingNames);
                existingNames.push(name);
                const buf = new Uint8Array(await file.arrayBuffer());
                if (localFileSystem) {
                  await writeLocalBytes(joinMarkdownImagePath(filePath, name), buf);
                } else {
                  if (!sessionId) throw new Error("An SSH session is required to store this image.");
                  const remote = dir === "/" ? `/${name}` : dir === "." ? name : `${dir}/${name}`;
                  await writePreviewRemoteBytes(sessionId, remote, buf);
                }
                const rel = markdownImageDestination(name);
                vditorRef.current?.insertValue(`![${name}](${rel})\n`);
              }
              publishChange(vditorRef.current?.getValue() ?? "");
              scheduleHydrate();
            })().catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              vditorRef.current?.tip(msg, 3000);
            });
            return null;
          },
        },
        after: () => {
          if (cancelled) return;
          if (!editable) vditor.disabled();
          syncSpellcheck();
          decorateCompatibilityNodes();
          scheduleHydrate();
          const scheduleResize = () => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
              resizeFrame = 0;
              try {
                const measuredWidth = el.getBoundingClientRect().width || el.clientWidth;
                if (measuredWidth <= 0) return;
                const width = `${Math.floor(measuredWidth)}px`;
                for (const node of el.querySelectorAll<HTMLElement>(
                  ".vditor-content, .vditor-ir, .vditor-ir .vditor-reset",
                )) {
                  node.style.width = width;
                  node.style.minWidth = "0";
                }
              } catch {
                /* The editor may be tearing down while its container resizes. */
              }
            });
          };
          if (typeof ResizeObserver !== "undefined") {
            sizeObserver = new ResizeObserver(scheduleResize);
            sizeObserver.observe(el);
            if (el.parentElement) sizeObserver.observe(el.parentElement);
          }
          resizeListener = () => {
            scheduleResize();
          };
          window.addEventListener("resize", resizeListener);
          scheduleResize();
          observer = new MutationObserver(() => {
            scheduleHydrate();
            syncToolbarTitles();
            syncSpellcheck();
            decorateCompatibilityNodes();
          });
          observer.observe(el, { childList: true, subtree: true });
          el.addEventListener("click", openCompatibilityNode, true);
          el.addEventListener("keydown", openCompatibilityNode, true);
          syncToolbarTitles();
          decorateCompatibilityNodes();
        },
        input: (value: string) => {
          publishChange(value);
          centerCaretBlock();
        },
        blur: (value: string) => {
          publishChange(value);
        },
      });
      vditorRef.current = vditor;
      registerPreviewEditorFlush(tabId, currentMarkdownValue);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    }

    const unsubTheme = subscribeAppTheme((theme) => {
      const v = vditorRef.current;
      if (!v) return;
      const vdTheme = themeFromApp(theme);
      v.setTheme(
        vdTheme,
        theme === "dark" ? "dark" : "light",
        theme === "dark" ? "native" : "github",
      );
    });

    return () => {
      cancelled = true;
      el.removeEventListener("paste", handleClipboardPaste, true);
      if (editorGenerationRef.current === editorGeneration) editorGenerationRef.current += 1;
      observer?.disconnect();
      el.removeEventListener("click", openCompatibilityNode, true);
      el.removeEventListener("keydown", openCompatibilityNode, true);
      sizeObserver?.disconnect();
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      unsubTheme();
      unregisterPreviewEditorFlush(tabId);
      try {
        vditorRef.current?.destroy();
      } catch {
        /* ignore */
      }
      vditorRef.current = null;
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
      blobUrlsRef.current = [];
    };
    // Re-create when tab/file/session identity changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [tabId, sessionId, localFileSystem, filePath, viewMode, hideToolbar, storeClipboardImages, editable]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    for (const input of root.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
      (input as HTMLElement & { spellcheck: boolean }).spellcheck = spellcheck;
    }
  }, [spellcheck]);

  useEffect(() => {
    const v = vditorRef.current;
    if (!v) return;
    try {
      if (editable) v.enable();
      else v.disabled();
    } catch {
      /* ignore */
    }
  }, [editable]);

  useEffect(() => {
    const v = vditorRef.current;
    if (!v) return;
    let current = "";
    try {
      current = v.getValue();
    } catch {
      return;
    }
    const next = projection?.source ?? text;
    if (next !== current) {
      v.setValue(next);
    }
  }, [text, projection?.source]);


  if (initError) {
    return (
      <div className="preview-markdown-wysiwyg-error" role="alert">
        {t("wysiwygInitFailed")}
        <div className="preview-markdown-wysiwyg-error-detail">{initError}</div>
      </div>
    );
  }

  if (viewMode === "source") {
    return (
      <div className="preview-markdown-compatibility" data-testid="markwisely-source-mode">
        {toolbarActions?.length ? (
          <div className="preview-markdown-compatibility-actions" role="toolbar" aria-label={t("wysiwygCompatibilityActions")}>
            {toolbarActions.map((action) => (
              <button key={action.id} type="button" onClick={action.onClick} aria-label={action.label} title={action.label}>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          className="preview-markdown-compatibility-source"
          data-testid="markwisely-compatibility-source"
          aria-label={t("wysiwygCompatibilitySource")}
          spellCheck
          value={text}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <div
      className="preview-markdown-wysiwyg"
      data-testid="preview-markdown-wysiwyg"
      onContextMenu={enableContextMenu ? (event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('[contenteditable="true"]')) return;
        event.preventDefault();
        const selection = window.getSelection();
        selectionRangeRef.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        const disabledCommands = (["undo", "redo"] as const)
          .filter((name) => hostRef.current?.querySelector<HTMLElement>(`.vditor-toolbar [data-type="${name}"]`)?.classList.contains("vditor-menu--disabled"))
          .map((name) => name === "undo" ? "undo" : "redo");
        setFormatContextMenu({
          x: Math.min(event.clientX, Math.max(8, window.innerWidth - 228)),
          y: Math.min(event.clientY, Math.max(8, window.innerHeight - 350)),
          disabledCommands,
        });
      } : undefined}
    >
      <div ref={hostRef} className="preview-markdown-wysiwyg-host" />
      {formatContextMenu ? <MarkWiselyFormatContextMenu
        {...formatContextMenu}
        onDismiss={() => setFormatContextMenu(null)}
        onCommand={(command: MarkWiselyFormatCommand) => {
          const editableRoot = hostRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
          if (!editableRoot) return;
          editableRoot.focus();
          const selection = window.getSelection();
          const selectedRange = selectionRangeRef.current?.cloneRange() ?? null;
          if (selection && selectedRange) {
            selection.removeAllRanges();
            selection.addRange(selectedRange);
          }
          const toolbarTypes: Partial<Record<MarkWiselyFormatCommand, string>> = {
            bulletList: "list", orderedList: "ordered-list", taskList: "check",
            indent: "indent", outdent: "outdent", link: "link", table: "table",
            horizontalRule: "line", undo: "undo", redo: "redo", inlineCode: "inline-code",
            quote: "quote", codeBlock: "code",
          };
          if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(command)) {
            hostRef.current?.querySelector<HTMLElement>('.vditor-toolbar [data-type="headings"]')?.click();
            hostRef.current?.querySelector<HTMLElement>(`.vditor-toolbar [data-tag="${command}"]`)?.click();
            setFormatContextMenu(null);
            return;
          }
          const toolbarType = toolbarTypes[command];
          if (toolbarType) {
            hostRef.current?.querySelector<HTMLElement>(`.vditor-toolbar [data-type="${toolbarType}"]`)?.click();
            setFormatContextMenu(null);
            return;
          }
          if (command === "insertImage") {
            hostRef.current?.querySelector<HTMLInputElement>('.vditor-toolbar [data-type="upload"] input[type="file"]')?.click();
            setFormatContextMenu(null);
            return;
          }
          const inlineTag: Partial<Record<MarkWiselyFormatCommand, string>> = {
            bold: "strong", italic: "em", strikeThrough: "del", inlineCode: "code",
          };
          if (inlineTag[command] && selectedRange && !selectedRange.collapsed) {
            const selectedText = selectedRange.toString();
            const wrapper = window.document.createElement(inlineTag[command]!);
            wrapper.append(selectedRange.extractContents());
            selectedRange.insertNode(wrapper);
            selectedRange.selectNodeContents(wrapper);
            selectionRangeRef.current = selectedRange.cloneRange();
            selection?.removeAllRanges();
            selection?.addRange(selectedRange);
            editableRoot.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
            const serialized = vditorRef.current?.getValue() ?? textRef.current;
            const marker: Record<string, [string, string]> = {
              bold: ["**", "**"], italic: ["*", "*"], strikeThrough: ["~~", "~~"], inlineCode: ["`", "`"],
            };
            const [open, close] = marker[command];
            const next = serialized === textRef.current && textRef.current.includes(selectedText)
              ? textRef.current.replace(selectedText, `${open}${selectedText}${close}`)
              : serialized;
            publishChangeRef.current(next);
          } else if (command !== "inlineCode") {
            const commands: Partial<Record<MarkWiselyFormatCommand, [string, string?]>> = {
              bold: ["bold"], italic: ["italic"], strikeThrough: ["strikeThrough"],
              paragraph: ["formatBlock", "P"], quote: ["formatBlock", "BLOCKQUOTE"], codeBlock: ["formatBlock", "PRE"],
              bulletList: ["insertUnorderedList"], orderedList: ["insertOrderedList"],
            };
            const nativeCommand = commands[command];
            if (nativeCommand) window.document.execCommand(nativeCommand[0], false, nativeCommand[1]);
          }
          setFormatContextMenu(null);
        }}
      /> : null}
      {activeCompatibilityNode && roundTripModel ? (() => {
        const segment = roundTripModel.segments.find((candidate) => candidate.id === activeCompatibilityNode.segmentId);
        if (!segment) return null;
        return <MarkWiselyCompatibilityNode
          kind={activeCompatibilityNode.compatibilityKind}
          source={activeCompatibilityNode.source}
          onChange={(source) => setActiveCompatibilityNode({ ...activeCompatibilityNode, preview: source.slice(0, 100), source })}
          onCancel={() => setActiveCompatibilityNode(null)}
          onApply={() => {
            onChangeRef.current?.(textRef.current.replace(segment.source, activeCompatibilityNode.source));
            setActiveCompatibilityNode(null);
          }}
        />;
      })() : null}
    </div>
  );
}
