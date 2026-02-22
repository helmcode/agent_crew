import { useState } from 'react';
import type { TaskLog, ActivityEvent } from '../types';

/**
 * Extract an ActivityEvent from a TaskLog payload, handling the NATS envelope
 * pattern where the real payload is nested at payload.payload.
 */
export function extractActivityEvent(log: TaskLog): ActivityEvent | null {
  if (log.message_type !== 'activity_event') return null;
  const p = log.payload as Record<string, unknown> | null;
  if (!p) return null;

  // Determine the actual event data object.
  // If the top-level payload already has event_type, use it directly (flat structure).
  // Otherwise check for a NATS envelope where the event is at payload.payload.
  let inner: Record<string, unknown>;
  if (typeof p.event_type === 'string') {
    inner = p;
  } else if (p.payload && typeof p.payload === 'object') {
    inner = p.payload as Record<string, unknown>;
  } else {
    return null;
  }

  const eventType = inner.event_type;
  if (
    eventType !== 'tool_use' &&
    eventType !== 'assistant' &&
    eventType !== 'tool_result' &&
    eventType !== 'error'
  ) {
    return null;
  }

  return {
    event_type: eventType,
    agent_name: typeof inner.agent_name === 'string' ? inner.agent_name : log.from_agent,
    tool_name: typeof inner.tool_name === 'string' ? inner.tool_name : undefined,
    action: typeof inner.action === 'string' ? inner.action : undefined,
    payload: inner.payload,
    timestamp: typeof inner.timestamp === 'string' ? inner.timestamp : log.created_at,
  };
}

/** Format a timestamp as a relative time string (e.g. "2s ago", "5m ago"). */
export function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

// --- Content classification ---

export type ContentCategory = 'delegation' | 'tool' | 'thinking' | 'text' | 'tool_result' | 'error';

interface ContentItem {
  type: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
}

export function extractContentItems(payload: unknown): ContentItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;

  // Check message.content[] pattern (Claude API response structure)
  if (p.message && typeof p.message === 'object') {
    const msg = p.message as Record<string, unknown>;
    if (Array.isArray(msg.content)) return msg.content as ContentItem[];
  }

  // Check direct content[] pattern
  if (Array.isArray(p.content)) return p.content as ContentItem[];

  return [];
}

export function classifyActivityEvent(event: ActivityEvent): ContentCategory {
  if (event.event_type === 'error') return 'error';
  if (event.event_type === 'tool_result') return 'tool_result';

  if (event.event_type === 'tool_use') {
    return event.tool_name === 'Task' ? 'delegation' : 'tool';
  }

  // For assistant events, inspect content items with priority order
  if (event.event_type === 'assistant') {
    const items = extractContentItems(event.payload);
    if (items.length > 0) {
      if (items.some(i => i.type === 'tool_use' && i.name === 'Task')) return 'delegation';
      if (items.some(i => i.type === 'tool_use')) return 'tool';
      if (items.some(i => i.type === 'thinking')) return 'thinking';
    }
    return 'text';
  }

  return 'text';
}

// --- Category display config ---

const categoryBgColors: Record<ContentCategory, string> = {
  delegation: 'border-purple-500/20 bg-purple-500/5',
  tool: 'border-blue-500/20 bg-blue-500/5',
  thinking: 'border-slate-500/20 bg-slate-500/5',
  text: 'border-cyan-500/20 bg-cyan-500/5',
  tool_result: 'border-green-500/20 bg-green-500/5',
  error: 'border-red-500/20 bg-red-500/5',
};

const categoryTextColors: Record<ContentCategory, string> = {
  delegation: 'text-purple-400',
  tool: 'text-blue-400',
  thinking: 'text-slate-400',
  text: 'text-cyan-400',
  tool_result: 'text-green-400',
  error: 'text-red-400',
};

const categoryLabels: Record<ContentCategory, string> = {
  delegation: 'delegation',
  tool: 'tool',
  thinking: 'thinking',
  text: 'message',
  tool_result: 'result',
  error: 'error',
};

// --- Icons ---

function CategoryIcon({ category }: { category: ContentCategory }) {
  switch (category) {
    case 'delegation':
      return (
        <svg data-testid="icon-delegation" className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
        </svg>
      );
    case 'tool':
      return (
        <svg data-testid="icon-tool" className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'thinking':
      return (
        <svg data-testid="icon-thinking" className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'text':
      return (
        <svg data-testid="icon-text" className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      );
    case 'tool_result':
      return (
        <svg data-testid="icon-tool-result" className="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'error':
      return (
        <svg data-testid="icon-error" className="h-3.5 w-3.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

// --- Summary helpers ---

function extractToolContext(input: Record<string, unknown>): string {
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.command === 'string') {
    const cmd = input.command;
    return cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
  }
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.query === 'string') return input.query;
  if (typeof input.url === 'string') return input.url;
  return '';
}

function getCategorySummary(event: ActivityEvent, category: ContentCategory): string {
  const items = extractContentItems(event.payload);

  switch (category) {
    case 'delegation': {
      const taskItem = items.find(i => i.type === 'tool_use' && i.name === 'Task');
      if (taskItem?.input) {
        const desc = typeof taskItem.input.description === 'string' ? taskItem.input.description : '';
        const subType = typeof taskItem.input.subagent_type === 'string' ? taskItem.input.subagent_type : '';
        if (subType || desc) {
          return `Delegated \u2192 ${subType}${subType && desc ? ': ' : ''}${desc}`;
        }
      }
      if (event.tool_name === 'Task') {
        return event.action ? `Delegated \u2192 ${event.action}` : 'Delegated task';
      }
      return 'Delegated task';
    }

    case 'tool': {
      const toolItem = items.find(i => i.type === 'tool_use' && i.name !== 'Task');
      if (toolItem?.name) {
        const context = toolItem.input ? extractToolContext(toolItem.input) : '';
        return context ? `${toolItem.name}: ${context}` : toolItem.name;
      }
      return event.tool_name
        ? `${event.tool_name}${event.action ? `: ${event.action}` : ''}`
        : event.action || 'Tool call';
    }

    case 'thinking': {
      const thinkItem = items.find(i => i.type === 'thinking');
      if (thinkItem && typeof thinkItem.text === 'string' && thinkItem.text.trim()) {
        const text = thinkItem.text.trim();
        return text.length > 100 ? text.slice(0, 100) + '...' : text;
      }
      return 'Thinking...';
    }

    case 'text': {
      const textItem = items.find(i => i.type === 'text');
      if (textItem && typeof textItem.text === 'string' && textItem.text.trim()) {
        const text = textItem.text.trim();
        return text.length > 120 ? text.slice(0, 120) + '...' : text;
      }
      if (typeof event.action === 'string' && event.action) {
        return event.action.length > 120 ? event.action.slice(0, 120) + '...' : event.action;
      }
      return 'Assistant message';
    }

    case 'tool_result':
      return event.tool_name ? `${event.tool_name} result` : 'Tool result';

    case 'error':
      return typeof event.action === 'string' && event.action ? event.action : 'Error occurred';
  }
}

function formatEventPayload(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, (key, value) => {
      // Filter out signature fields from display (not useful, potentially large)
      if (key === 'signature') return undefined;
      return value;
    }, 2);
  } catch {
    return String(payload);
  }
}

/** Full activity event card with collapsible payload section. Used in the right sidebar. */
export function ActivityEventCard({ log }: { log: TaskLog }) {
  const [expanded, setExpanded] = useState(false);
  const event = extractActivityEvent(log);
  if (!event) return null;

  const category = classifyActivityEvent(event);
  const payloadStr = formatEventPayload(event.payload);
  const hasPayload = payloadStr.length > 0;

  return (
    <div
      data-testid="activity-event-card"
      className={`mb-2 rounded-lg border ${categoryBgColors[category]} px-3 py-2${category === 'thinking' ? ' opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <CategoryIcon category={category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${categoryTextColors[category]}`}>
              {categoryLabels[category]}
            </span>
            <span className="text-slate-500">{event.agent_name}</span>
            <span className="ml-auto text-slate-600">{relativeTime(event.timestamp)}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-300">{getCategorySummary(event, category)}</p>
        </div>
      </div>
      {hasPayload && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <pre
              data-testid="event-payload"
              className="mt-1 max-h-48 overflow-auto rounded bg-slate-950/50 p-2 text-xs text-slate-400"
            >
              {payloadStr}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact live feed for the chat panel. Shows events inline between user messages and agent responses. */
export function LiveActivityFeed({ events }: { events: TaskLog[] }) {
  if (events.length === 0) return null;

  return (
    <div data-testid="live-activity-feed" className="mb-3 space-y-1">
      {events.map((log) => {
        const event = extractActivityEvent(log);
        if (!event) return null;

        const category = classifyActivityEvent(event);

        return (
          <div
            key={log.id}
            data-testid="live-activity-item"
            className={`flex items-center gap-2 rounded-md bg-slate-900/30 px-2.5 py-1.5 text-xs${category === 'thinking' ? ' opacity-60' : ''}`}
          >
            <CategoryIcon category={category} />
            <span className={categoryTextColors[category]}>
              {event.agent_name}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {getCategorySummary(event, category)}
            </span>
            <span className="flex-shrink-0 text-slate-600">
              {relativeTime(event.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
