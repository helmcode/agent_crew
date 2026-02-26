import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  children: string;
}

const ALLOWED_ELEMENTS = [
  'p', 'strong', 'em', 'ul', 'ol', 'li', 'pre', 'code',
  'h1', 'h2', 'h3', 'a', 'blockquote', 'hr', 'br',
];

const SAFE_URL_PROTOCOLS = /^(https?:|mailto:)/i;

function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (SAFE_URL_PROTOCOLS.test(href)) return href;
  return undefined;
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      skipHtml
      allowedElements={ALLOWED_ELEMENTS}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded bg-slate-900 p-3 last:mb-0">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="rounded bg-slate-700/50 px-1 py-0.5 font-mono text-xs">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="mb-2 text-lg font-bold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 text-base font-bold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 text-sm font-bold">{children}</h3>
        ),
        a: ({ children, href }) => {
          const safeHref = sanitizeHref(href);
          if (!safeHref) return <span className="text-slate-400">{children}</span>;
          return (
            <a
              href={safeHref}
              className="text-blue-400 underline hover:text-blue-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-slate-600 pl-3 italic text-slate-400 last:mb-0">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-slate-700" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
