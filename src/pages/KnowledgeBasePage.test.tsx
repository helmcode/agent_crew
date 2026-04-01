import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeBasePage } from './KnowledgeBasePage';
import {
  mockDocument,
  mockProcessingDocument,
  mockErrorDocument,
  createFetchMock,
} from '../test/mocks';

function renderPage() {
  return render(
    <MemoryRouter>
      <KnowledgeBasePage />
    </MemoryRouter>,
  );
}

describe('KnowledgeBasePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders loading skeleton initially', () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': {
        body: [],
      },
    });
    renderPage();
    // Skeleton placeholders use animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no documents', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [] },
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/No documents yet/),
      ).toBeInTheDocument();
    });
  });

  it('renders documents table with data', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': {
        body: [mockDocument, mockProcessingDocument, mockErrorDocument],
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('architecture.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('api-spec.md')).toBeInTheDocument();
    expect(screen.getByText('corrupted.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('displays chunk count for ready documents', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [mockDocument] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('displays dash for chunk count on non-ready documents', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [mockProcessingDocument] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  it('filters documents by search', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': {
        body: [mockDocument, mockProcessingDocument],
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('architecture.pdf')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search documents...');
    fireEvent.change(searchInput, { target: { value: 'api' } });

    expect(screen.queryByText('architecture.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('api-spec.md')).toBeInTheDocument();
  });

  it('shows upload button', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [] },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Upload')).toBeInTheDocument();
    });
  });

  it('renders page title', () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [] },
    });
    renderPage();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });

  it('shows file size formatted correctly', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [mockDocument] },
    });
    renderPage();
    await waitFor(() => {
      // 1048576 bytes = 1.0 MB
      expect(screen.getByText('1.0 MB')).toBeInTheDocument();
    });
  });

  it('shows accepted file types in drop zone', async () => {
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [] },
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/PDF, TXT, Markdown, CSV, XLSX, JSON/),
      ).toBeInTheDocument();
    });
  });

  it('polls when processing documents exist', async () => {
    const fetchMock = createFetchMock({
      '/api/knowledge/documents': { body: [mockProcessingDocument] },
    });
    globalThis.fetch = fetchMock;
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('api-spec.md')).toBeInTheDocument();
    });

    // Initial fetch
    const initialCalls = fetchMock.mock.calls.length;

    // Advance timer to trigger poll
    vi.advanceTimersByTime(5_000);

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  it('confirms before deleting a document', async () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    globalThis.fetch = createFetchMock({
      '/api/knowledge/documents': { body: [mockDocument] },
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('architecture.pdf')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText('Delete architecture.pdf');
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('architecture.pdf'),
    );
  });
});
