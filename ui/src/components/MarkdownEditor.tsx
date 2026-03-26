import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  CodeMirrorEditor,
  MDXEditor,
  codeBlockPlugin,
  codeMirrorPlugin,
  type CodeBlockEditorDescriptor,
  type MDXEditorMethods,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type RealmPlugin,
} from "@mdxeditor/editor";
import { buildProjectMentionHref, parseProjectMentionHref } from "@atototo/shared";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { findMentionAtCursor } from "./markdown-mentions";
import { MarkdownBody } from "./MarkdownBody";

/* ---- Mention types ---- */

export interface MentionOption {
  id: string;
  name: string;
  kind?: "agent" | "project";
  projectId?: string;
  projectColor?: string | null;
}

/* ---- Editor props ---- */

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  onBlur?: () => void;
  imageUploadHandler?: (file: File) => Promise<string>;
  bordered?: boolean;
  /** List of mentionable entities. Enables @-mention autocomplete. */
  mentions?: MentionOption[];
  /** Called on Cmd/Ctrl+Enter */
  onSubmit?: () => void;
}

export interface MarkdownEditorRef {
  focus: () => void;
}

/* ---- Mention detection helpers ---- */

interface MentionState {
  query: string;
  top: number;
  left: number;
  textNode: Text;
  atPos: number;
  endPos: number;
}

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
};

const FALLBACK_CODE_BLOCK_DESCRIPTOR: CodeBlockEditorDescriptor = {
  // Keep this lower than codeMirrorPlugin's descriptor priority so known languages
  // still use the standard matching path; this catches malformed/unknown fences.
  priority: 0,
  match: () => true,
  Editor: CodeMirrorEditor,
};

function detectMention(container: HTMLElement): MentionState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  if (!container.contains(textNode)) return null;

  const text = textNode.textContent ?? "";
  const offset = range.startOffset;

  const mention = findMentionAtCursor(text, offset);
  if (!mention) return null;

  // Get position relative to container
  const tempRange = document.createRange();
  tempRange.setStart(textNode, mention.atPos);
  tempRange.setEnd(textNode, mention.atPos + 1);
  const rect = tempRange.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    query: mention.query,
    top: rect.bottom - containerRect.top,
    left: rect.left - containerRect.left,
    textNode: textNode as Text,
    atPos: mention.atPos,
    endPos: offset,
  };
}

function mentionMarkdown(option: MentionOption): string {
  if (option.kind === "project" && option.projectId) {
    return `[@${option.name}](${buildProjectMentionHref(option.projectId, option.projectColor ?? null)}) `;
  }
  return `@${option.name} `;
}

/** Replace `@<query>` in the markdown string with the selected mention token. */
function applyMention(markdown: string, query: string, option: MentionOption): string {
  const search = `@${query}`;
  const replacement = mentionMarkdown(option);
  const idx = markdown.lastIndexOf(search);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx) + replacement + markdown.slice(idx + search.length);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const trimmed = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mentionChipStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const textColor = luminance > 0.55 ? "#111827" : "#f8fafc";
  return {
    borderColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    color: textColor,
  };
}

/* ---- Component ---- */

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  contentClassName,
  onBlur,
  imageUploadHandler,
  bordered = true,
  mentions,
  onSubmit,
}: MarkdownEditorProps, forwardedRef) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<MDXEditorMethods>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestValueRef = useRef(value);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Stable ref for imageUploadHandler so plugins don't recreate on every render
  const imageUploadHandlerRef = useRef(imageUploadHandler);
  imageUploadHandlerRef.current = imageUploadHandler;

  // Mention state (ref kept in sync so callbacks always see the latest value)
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const mentionStateRef = useRef<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionActive = mentionState !== null && mentions && mentions.length > 0;
  const projectColorById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const mention of mentions ?? []) {
      if (mention.kind === "project" && mention.projectId) {
        map.set(mention.projectId, mention.projectColor ?? null);
      }
    }
    return map;
  }, [mentions]);

  const filteredMentions = useMemo(() => {
    if (!mentionState || !mentions) return [];
    const q = mentionState.query.toLowerCase();
    return mentions.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionState?.query, mentions]);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => {
      ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
    },
  }), []);

  // Whether the image plugin should be included (boolean is stable across renders
  // as long as the handler presence doesn't toggle)
  const hasImageUpload = Boolean(imageUploadHandler);

  const plugins = useMemo<RealmPlugin[]>(() => {
    const imageHandler = hasImageUpload
      ? async (file: File) => {
          const handler = imageUploadHandlerRef.current;
          if (!handler) throw new Error(t("markdownEditor.noImageUploadHandler"));
          try {
            const src = await handler(file);
            setUploadError(null);
            return src;
          } catch (err) {
            const message = err instanceof Error ? err.message : t("markdownEditor.imageUploadFailed");
            setUploadError(message);
            throw err;
          }
        }
      : undefined;
    const all: RealmPlugin[] = [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      tablePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({
        defaultCodeBlockLanguage: "txt",
        codeBlockEditorDescriptors: [FALLBACK_CODE_BLOCK_DESCRIPTOR],
      }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
      markdownShortcutPlugin(),
    ];
    if (imageHandler) {
      all.push(imagePlugin({ imageUploadHandler: imageHandler }));
    }
    return all;
  }, [hasImageUpload, t]);

  useEffect(() => {
    if (value !== latestValueRef.current) {
      ref.current?.setMarkdown(value);
      latestValueRef.current = value;
    }
  }, [value]);

  const decorateProjectMentions = useCallback(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    const links = editable.querySelectorAll("a");
    for (const node of links) {
      const link = node as HTMLAnchorElement;
      const parsed = parseProjectMentionHref(link.getAttribute("href") ?? "");
      if (!parsed) {
        if (link.dataset.projectMention === "true") {
          link.dataset.projectMention = "false";
          link.classList.remove("baton-project-mention-chip");
          link.removeAttribute("contenteditable");
          link.style.removeProperty("border-color");
          link.style.removeProperty("background-color");
          link.style.removeProperty("color");
        }
        continue;
      }

      const color = parsed.color ?? projectColorById.get(parsed.projectId) ?? null;
      link.dataset.projectMention = "true";
      link.classList.add("baton-project-mention-chip");
      link.setAttribute("contenteditable", "false");
      const style = mentionChipStyle(color);
      if (style) {
        link.style.borderColor = style.borderColor ?? "";
        link.style.backgroundColor = style.backgroundColor ?? "";
        link.style.color = style.color ?? "";
      }
    }
  }, [projectColorById]);

  // Mention detection for contentEditable (MDXEditor)
  const checkMention = useCallback(() => {
    if (!mentions || mentions.length === 0 || !containerRef.current) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const result = detectMention(containerRef.current);
    mentionStateRef.current = result;
    if (result) {
      setMentionState(result);
      setMentionIndex(0);
    } else {
      setMentionState(null);
    }
  }, [mentions]);

  // Mention detection for plain <textarea> (bordered mode)
  const checkMentionTextarea = useCallback(() => {
    if (!mentions || mentions.length === 0) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const ta = textareaRef.current;
    if (!ta || document.activeElement !== ta) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    const text = ta.value;
    const offset = ta.selectionStart ?? 0;
    const mention = findMentionAtCursor(text, offset);
    if (!mention) {
      mentionStateRef.current = null;
      setMentionState(null);
      return;
    }
    // Calculate popup position from textarea cursor
    const containerRect = containerRef.current?.getBoundingClientRect();
    const taRect = ta.getBoundingClientRect();
    if (!containerRect) return;
    // Approximate position: use a hidden mirror or simple line/char estimation
    const style = window.getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const textBeforeCursor = text.slice(0, offset);
    const lines = textBeforeCursor.split("\n");
    const currentLineIndex = lines.length - 1;
    const top = taRect.top - containerRect.top + paddingTop + (currentLineIndex + 1) * lineHeight - ta.scrollTop;
    const left = paddingLeft;
    const result: MentionState = {
      query: mention.query,
      top,
      left,
      textNode: null as unknown as Text,
      atPos: mention.atPos,
      endPos: offset,
    };
    mentionStateRef.current = result;
    setMentionState(result);
    setMentionIndex(0);
  }, [mentions]);

  useEffect(() => {
    if (!mentions || mentions.length === 0) return;

    const el = containerRef.current;
    // Listen for input events on the container so mention detection
    // also fires after typing (e.g. space to dismiss).
    const onInput = () => requestAnimationFrame(checkMention);

    document.addEventListener("selectionchange", checkMention);
    el?.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("selectionchange", checkMention);
      el?.removeEventListener("input", onInput, true);
    };
  }, [checkMention, mentions]);

  useEffect(() => {
    const editable = containerRef.current?.querySelector('[contenteditable="true"]');
    if (!editable) return;
    decorateProjectMentions();
    const observer = new MutationObserver(() => {
      decorateProjectMentions();
    });
    observer.observe(editable, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [decorateProjectMentions, value]);

  const selectMention = useCallback(
    (option: MentionOption) => {
      // Read from ref to avoid stale-closure issues (selectionchange can
      // update state between the last render and this callback firing).
      const state = mentionStateRef.current;
      if (!state) return;

      const replacement = mentionMarkdown(option);

      // ── Textarea (bordered) mode ──
      const ta = textareaRef.current;
      if (ta && bordered) {
        const current = ta.value;
        const before = current.slice(0, state.atPos);
        const after = current.slice(state.endPos);
        const next = before + replacement + after;
        latestValueRef.current = next;
        onChange(next);
        const cursorPos = state.atPos + replacement.length;
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(cursorPos, cursorPos);
        });
        mentionStateRef.current = null;
        setMentionState(null);
        return;
      }

      // ── MDXEditor (contentEditable) mode ──
      if (option.kind === "project" && option.projectId) {
        const current = latestValueRef.current;
        const next = applyMention(current, state.query, option);
        if (next !== current) {
          latestValueRef.current = next;
          ref.current?.setMarkdown(next);
          onChange(next);
        }
        requestAnimationFrame(() => {
          ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
          decorateProjectMentions();
        });
        mentionStateRef.current = null;
        setMentionState(null);
        return;
      }

      // Replace @query directly via DOM selection so the cursor naturally
      // lands after the inserted text. Lexical picks up the change through
      // its normal input-event handling.
      const sel = window.getSelection();
      if (sel && state.textNode?.isConnected) {
        const range = document.createRange();
        range.setStart(state.textNode, state.atPos);
        range.setEnd(state.textNode, state.endPos);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, replacement);

        // After Lexical reconciles the DOM, the cursor position set by
        // execCommand may be lost. Explicitly reposition it after the
        // inserted mention text.
        const cursorTarget = state.atPos + replacement.length;
        requestAnimationFrame(() => {
          const newSel = window.getSelection();
          if (!newSel) return;
          // Try the original text node first (it may still be valid)
          if (state.textNode.isConnected) {
            const len = state.textNode.textContent?.length ?? 0;
            if (cursorTarget <= len) {
              const r = document.createRange();
              r.setStart(state.textNode, cursorTarget);
              r.collapse(true);
              newSel.removeAllRanges();
              newSel.addRange(r);
              return;
            }
          }
          // Fallback: search for the replacement in text nodes
          const editable = containerRef.current?.querySelector('[contenteditable="true"]');
          if (!editable) return;
          const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent ?? "";
            const idx = text.indexOf(replacement);
            if (idx !== -1) {
              const pos = idx + replacement.length;
              if (pos <= text.length) {
                const r = document.createRange();
                r.setStart(node, pos);
                r.collapse(true);
                newSel.removeAllRanges();
                newSel.addRange(r);
                return;
              }
            }
          }
        });
      } else {
        // Fallback: full markdown replacement when DOM node is stale
        const current = latestValueRef.current;
        const next = applyMention(current, state.query, option);
        if (next !== current) {
          latestValueRef.current = next;
          ref.current?.setMarkdown(next);
          onChange(next);
        }
        requestAnimationFrame(() => {
          ref.current?.focus(undefined, { defaultSelection: "rootEnd" });
        });
      }

      requestAnimationFrame(() => {
        decorateProjectMentions();
      });

      mentionStateRef.current = null;
      setMentionState(null);
    },
    [decorateProjectMentions, onChange],
  );

  function hasFilePayload(evt: DragEvent<HTMLDivElement>) {
    return Array.from(evt.dataTransfer?.types ?? []).includes("Files");
  }

  const canDropImage = Boolean(imageUploadHandler);
  const [mode, setMode] = useState<"write" | "preview">("write");

  // Toolbar helpers — insert markdown syntax around selection or at cursor
  const insertMarkdown = useCallback((prefix: string, suffix = "") => {
    if (bordered) {
      // Plain textarea mode — insert around selection
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.slice(start, end);
      const replacement = `${prefix}${selected}${suffix}`;
      // Use native input setter to trigger React onChange
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      const next = ta.value.slice(0, start) + replacement + ta.value.slice(end);
      nativeSet?.call(ta, next);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      // Position cursor after inserted text
      requestAnimationFrame(() => {
        const cursorPos = selected ? start + replacement.length : start + prefix.length;
        ta.setSelectionRange(cursorPos, cursorPos);
      });
      return;
    }
    // WYSIWYG (MDXEditor) mode
    const editable = containerRef.current?.querySelector('[contenteditable="true"]') as HTMLElement | null;
    if (!editable) return;
    editable.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const selected = sel.toString();
    const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}${suffix}`;
    document.execCommand("insertText", false, replacement);
  }, [bordered]);

  type ToolbarItem = { label?: string; icon?: string; title: string; action: () => void; className?: string } | "sep";
  const toolbarButtons = useMemo<ToolbarItem[]>(() => [
    { label: "B", title: "Bold", action: () => insertMarkdown("**", "**"), className: "font-bold" },
    { label: "I", title: "Italic", action: () => insertMarkdown("_", "_"), className: "italic" },
    { label: "~", title: "Strikethrough", action: () => insertMarkdown("~~", "~~") },
    "sep",
    { label: "H", title: "Heading", action: () => insertMarkdown("## ") },
    { label: "<>", title: "Code", action: () => insertMarkdown("`", "`"), className: "font-mono text-[11px]" },
    { label: "```", title: "Code block", action: () => insertMarkdown("```\n", "\n```"), className: "font-mono text-[10px]" },
    "sep",
    { icon: "list", title: "Bullet list", action: () => insertMarkdown("- ") },
    { icon: "list-ordered", title: "Numbered list", action: () => insertMarkdown("1. ") },
    { icon: "quote", title: "Quote", action: () => insertMarkdown("> ") },
    "sep",
    { icon: "link", title: "Link", action: () => insertMarkdown("[", "](url)") },
  ], [insertMarkdown]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative baton-mdxeditor-scope",
        bordered ? "rounded-[6px] border border-border bg-card overflow-hidden" : "bg-transparent",
        isDragOver && "ring-1 ring-primary/60 bg-accent/20",
        className,
      )}
      onKeyDownCapture={(e) => {
        // Cmd/Ctrl+Enter to submit
        if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
          return;
        }

        // Mention keyboard handling
        if (mentionActive) {
          // Space dismisses the popup (let the character be typed normally)
          if (e.key === " ") {
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Escape always dismisses
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            mentionStateRef.current = null;
            setMentionState(null);
            return;
          }
          // Arrow / Enter / Tab only when there are filtered results
          if (filteredMentions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              setMentionIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              selectMention(filteredMentions[mentionIndex]);
              return;
            }
          }
        }
      }}
      onDragEnter={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        dragDepthRef.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(evt) => {
        if (!canDropImage || !hasFilePayload(evt)) return;
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (!canDropImage) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragOver(false);
      }}
      onDrop={() => {
        dragDepthRef.current = 0;
        setIsDragOver(false);
      }}
    >
      {/* Write / Preview mode tabs */}
      {bordered && (
        <div className="flex items-center border-b border-border bg-muted/30 px-2 gap-0">
          <button
            type="button"
            className={cn(
              "px-3 py-[7px] text-xs font-medium border-b-2 -mb-px transition-colors",
              mode === "write"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-[7px] text-xs font-medium border-b-2 -mb-px transition-colors",
              mode === "preview"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setMode("preview");
            }}
          >
            Preview
          </button>
        </div>
      )}

      {/* Markdown GUI toolbar (write mode only) */}
      {bordered && mode === "write" && (
        <div className="flex items-center px-2 py-1 border-b border-border gap-0.5">
          {toolbarButtons.map((btn, i) => {
            if (btn === "sep") return <div key={`sep-${i}`} className="w-px h-4 bg-border mx-1" />;
            return (
              <button
                key={btn.title}
                type="button"
                title={btn.title}
                className={cn(
                  "w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-[13px]",
                  "className" in btn && btn.className,
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  btn.action();
                }}
              >
                {"icon" in btn ? (
                  btn.icon === "list" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="2" cy="4" r="1.5"/><rect x="5" y="3" width="10" height="2" rx="1"/><circle cx="2" cy="8" r="1.5"/><rect x="5" y="7" width="10" height="2" rx="1"/><circle cx="2" cy="12" r="1.5"/><rect x="5" y="11" width="10" height="2" rx="1"/></svg>
                  ) : btn.icon === "list-ordered" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><text x="0" y="5.5" fontSize="5" fontWeight="700">1.</text><rect x="5" y="3" width="10" height="2" rx="1"/><text x="0" y="9.5" fontSize="5" fontWeight="700">2.</text><rect x="5" y="7" width="10" height="2" rx="1"/><text x="0" y="13.5" fontSize="5" fontWeight="700">3.</text><rect x="5" y="11" width="10" height="2" rx="1"/></svg>
                  ) : btn.icon === "quote" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="0" y="2" width="2.5" height="12" rx="1.25"/><rect x="5" y="4" width="9" height="2" rx="1"/><rect x="5" y="8" width="7" height="2" rx="1"/></svg>
                  ) : btn.icon === "link" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6.5 8.5a3 3 0 004.3.3l2-2a3 3 0 00-4.2-4.3L7.3 3.8"/><path d="M9.5 7.5a3 3 0 00-4.3-.3l-2 2a3 3 0 004.2 4.3l1.3-1.3"/></svg>
                  ) : <span>{btn.label}</span>
                ) : (
                  <span>{btn.label}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Write mode */}
      <div className={cn(mode === "write" ? "flex flex-col" : "hidden", "flex-1 min-h-0")}>
        {bordered ? (
          /* Plain textarea for comment composer — raw markdown input */
          <textarea
            ref={textareaRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              latestValueRef.current = e.target.value;
              onChange(e.target.value);
              requestAnimationFrame(checkMentionTextarea);
            }}
            onSelect={checkMentionTextarea}
            onBlur={() => { onBlur?.(); }}
            onPaste={(e) => {
              if (!imageUploadHandler) return;
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith("image/")) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (!file) return;
                  const placeholder = `![uploading...]()\n`;
                  const ta = textareaRef.current;
                  const start = ta?.selectionStart ?? value.length;
                  const before = value.slice(0, start);
                  const after = value.slice(ta?.selectionEnd ?? start);
                  const withPlaceholder = before + placeholder + after;
                  latestValueRef.current = withPlaceholder;
                  onChange(withPlaceholder);
                  imageUploadHandler(file).then((url) => {
                    const next = latestValueRef.current.replace(placeholder, `![image](${url})\n`);
                    latestValueRef.current = next;
                    onChange(next);
                  }).catch(() => {
                    const next = latestValueRef.current.replace(placeholder, "");
                    latestValueRef.current = next;
                    onChange(next);
                  });
                  return;
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit?.();
              }
            }}
            className={cn(
              "w-full resize-y bg-transparent px-3.5 py-3 text-sm focus:outline-none min-h-[80px] flex-1",
              contentClassName,
            )}
            rows={3}
          />
        ) : (
          /* WYSIWYG MDXEditor for description fields */
          <MDXEditor
            ref={ref}
            markdown={value}
            placeholder={placeholder}
            onChange={(next) => {
              latestValueRef.current = next;
              onChange(next);
            }}
            onBlur={() => onBlur?.()}
            className={cn("baton-mdxeditor", "baton-mdxeditor--borderless")}
            contentEditableClassName={cn(
              "baton-mdxeditor-content focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:list-item",
              contentClassName,
            )}
            overlayContainer={containerRef.current}
            plugins={plugins}
          />
        )}

        {/* Mention dropdown */}
        {mentionActive && filteredMentions.length > 0 && (
          <div
            className="absolute z-50 min-w-[180px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
            style={{ top: mentionState.top + 4, left: mentionState.left }}
          >
            {filteredMentions.map((option, i) => (
              <button
                key={option.id}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent/50 transition-colors",
                  i === mentionIndex && "bg-accent",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(option);
                }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {option.kind === "project" && option.projectId ? (
                  <span
                    className="inline-flex h-2 w-2 rounded-full border border-border/50"
                    style={{ backgroundColor: option.projectColor ?? "#64748b" }}
                  />
                ) : (
                  <span className="text-muted-foreground">@</span>
                )}
                <span>{option.name}</span>
                {option.kind === "project" && option.projectId && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    Project
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {isDragOver && canDropImage && (
          <div
            className={cn(
              "pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-md border border-dashed border-primary/80 bg-primary/10 text-xs font-medium text-primary",
              !bordered && "inset-0 rounded-sm",
            )}
          >
            Drop image to upload
          </div>
        )}
      </div>

      {/* Preview mode */}
      {mode === "preview" && (
        <div className={cn("px-3.5 py-3", contentClassName)}>
          {value.trim() ? (
            <MarkdownBody className="text-sm">{value}</MarkdownBody>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nothing to preview</p>
          )}
        </div>
      )}

      {uploadError && (
        <p className="px-3 pb-2 text-xs text-destructive">{uploadError}</p>
      )}
    </div>
  );
});
