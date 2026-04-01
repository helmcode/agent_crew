import { useEffect, useState, useCallback, useRef } from 'react';
import type { Document } from '../types';
import { knowledgeApi } from '../services/api';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = '.pdf,.txt,.md,.csv,.xlsx,.json';
const POLL_INTERVAL_MS = 5_000;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status, message }: { status: string; message?: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending' },
    processing: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Processing' },
    ready: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Ready' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Error' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}
      title={message || undefined}
    >
      {status === 'processing' && (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {c.label}
    </span>
  );
}

function fileTypeIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return (
      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

export function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await knowledgeApi.list();
      setDocuments(data ?? []);
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to load documents. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll when there are pending/processing documents
  useEffect(() => {
    const hasInProgress = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );

    if (hasInProgress) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchDocuments, POLL_INTERVAL_MS);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) {
          toast('error', `File "${file.name}" exceeds the 50MB limit.`);
          return;
        }
      }

      setUploading(true);
      try {
        for (const file of fileArray) {
          await knowledgeApi.upload(file);
        }
        toast(
          'success',
          fileArray.length === 1
            ? `"${fileArray[0].name}" uploaded successfully.`
            : `${fileArray.length} files uploaded successfully.`,
        );
        fetchDocuments();
      } catch (err) {
        toast('error', friendlyError(err, 'Failed to upload file. Please try again.'));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [fetchDocuments],
  );

  const handleDelete = useCallback(
    async (doc: Document) => {
      if (!confirm(`Delete "${doc.name}"? This will remove the document and its embeddings.`)) return;
      try {
        await knowledgeApi.delete(doc.id);
        toast('success', 'Document deleted.');
        fetchDocuments();
      } catch (err) {
        toast('error', friendlyError(err, 'Failed to delete document. Please try again.'));
      }
    },
    [fetchDocuments],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload],
  );

  const filteredDocuments = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.file_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {uploading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          )}
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files);
            }
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        <svg className="mx-auto h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
        <p className="mt-2 text-sm text-slate-400">
          Drag and drop files here, or{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-400 hover:text-blue-300"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          PDF, TXT, Markdown, CSV, XLSX, JSON (max 50MB)
        </p>
      </div>

      {/* Search */}
      {documents.length > 0 && (
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Documents table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg bg-slate-800/50 p-4">
              <div className="flex items-center gap-4">
                <div className="h-5 w-5 rounded bg-slate-700" />
                <div className="h-4 w-48 rounded bg-slate-700" />
                <div className="ml-auto h-4 w-16 rounded bg-slate-700/60" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center">
          <svg className="mx-auto h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="mt-3 text-slate-500">
            {documents.length === 0
              ? 'No documents yet. Upload files to build your knowledge base.'
              : 'No matching documents.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Document
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 md:table-cell">
                  Chunks
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredDocuments.map((doc) => (
                <tr
                  key={doc.id}
                  className="group transition-colors hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {fileTypeIcon(doc.mime_type)}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {doc.name}
                        </p>
                        {doc.name !== doc.file_name && (
                          <p className="truncate text-xs text-slate-500">
                            {doc.file_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} message={doc.status_message} />
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-400 sm:table-cell">
                    {formatFileSize(doc.file_size)}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-400 md:table-cell">
                    {doc.status === 'ready' ? doc.chunk_count : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(doc)}
                      className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
