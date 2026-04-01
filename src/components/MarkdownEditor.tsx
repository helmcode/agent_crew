import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useCallback, useEffect, useRef } from 'react';
import TurndownService from 'turndown';
import { marked } from 'marked';

interface MarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Preserve line breaks in turndown
turndown.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '\n',
});

function htmlFromMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

function markdownFromHtml(html: string): string {
  return turndown.turndown(html);
}


interface ToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-1.5 py-1 text-xs font-medium transition-colors ${
      active
        ? 'bg-blue-500 text-white'
        : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
    }`;

  const addLink = useCallback(() => {
    const url = window.prompt('URL:');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-700 bg-slate-800 px-2 py-1.5 rounded-t-lg">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Bold (Cmd+B)">
        <strong>B</strong>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Italic (Cmd+I)">
        <em>I</em>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="Strikethrough">
        <s>S</s>
      </button>

      <span className="mx-1 h-4 w-px bg-slate-700" />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editor.isActive('heading', { level: 1 }))} title="Heading 1">
        H1
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive('heading', { level: 2 }))} title="Heading 2">
        H2
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive('heading', { level: 3 }))} title="Heading 3">
        H3
      </button>

      <span className="mx-1 h-4 w-px bg-slate-700" />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Bullet List">
        &bull;
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Ordered List">
        1.
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="Blockquote">
        &ldquo;&rdquo;
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive('codeBlock'))} title="Code Block">
        &lt;/&gt;
      </button>
      <button type="button" onClick={addLink} className={btnClass(editor.isActive('link'))} title="Link">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)} title="Horizontal Rule">
        &#8213;
      </button>
    </div>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  minHeight = '120px',
}: MarkdownEditorProps) {
  const [rawMode, setRawMode] = useState(false);
  // Track whether we're syncing from external value to avoid loops
  const isSyncing = useRef(false);
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-400 underline' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    editable: !disabled,
    content: htmlFromMarkdown(value),
    onCreate: ({ editor: ed }) => {
      const md = markdownFromHtml(ed.getHTML());
      lastEmitted.current = md;
      onChange(md);
    },
    onUpdate: ({ editor: ed }) => {
      if (isSyncing.current) return;
      const md = markdownFromHtml(ed.getHTML());
      lastEmitted.current = md;
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none px-3 py-2 text-sm text-slate-200',
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes into editor (e.g. form reset)
  useEffect(() => {
    if (!editor || rawMode) return;
    if (value === lastEmitted.current) return;
    isSyncing.current = true;
    editor.commands.setContent(htmlFromMarkdown(value));
    lastEmitted.current = value;
    isSyncing.current = false;
  }, [value, editor, rawMode]);

  // Sync disabled state
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  const handleRawChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const md = e.target.value;
      lastEmitted.current = md;
      onChange(md);
    },
    [onChange],
  );

  const toggleRawMode = useCallback(() => {
    if (rawMode && editor) {
      // Switching back to WYSIWYG — sync current value into editor
      isSyncing.current = true;
      editor.commands.setContent(htmlFromMarkdown(value));
      lastEmitted.current = value;
      isSyncing.current = false;
    }
    setRawMode(!rawMode);
  }, [rawMode, editor, value]);

  return (
    <div className={`flex min-h-0 flex-1 flex-col rounded-lg border border-slate-600 bg-slate-900 ${disabled ? 'opacity-60' : ''}`} data-testid="markdown-editor">
      {/* Mode toggle */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-700 px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {rawMode ? 'Markdown' : 'Rich Text'}
        </span>
        <button
          type="button"
          onClick={toggleRawMode}
          disabled={disabled}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed"
          data-testid="markdown-editor-toggle"
        >
          {rawMode ? 'WYSIWYG' : 'Raw'}
        </button>
      </div>

      {rawMode ? (
        <textarea
          value={value}
          onChange={handleRawChange}
          disabled={disabled}
          className="min-h-0 w-full flex-1 resize-none rounded-b-lg bg-slate-900 px-3 py-2 font-mono text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          style={{ minHeight }}
          placeholder={placeholder}
          data-testid="markdown-editor-raw"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Toolbar editor={editor} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EditorContent editor={editor} data-testid="markdown-editor-wysiwyg" />
          </div>
        </div>
      )}
    </div>
  );
}
