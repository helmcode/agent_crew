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

function EventIcon({ type }: { type: ActivityEvent['event_type'] }) {
  switch (type) {
    case 'tool_use':
      return (
        <svg data-testid="icon-tool-use" className="h-3.5 w-3.5 flex-shrink-0 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'assistant':
      return (
        <svg data-testid="icon-assistant" className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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

const eventBgColors: Record<ActivityEvent['event_type'], string> = {
  tool_use: 'border-yellow-500/20 bg-yellow-500/5',
  assistant: 'border-cyan-500/20 bg-cyan-500/5',
  tool_result: 'border-green-500/20 bg-green-500/5',
  error: 'border-red-500/20 bg-red-500/5',
};

const eventTextColors: Record<ActivityEvent['event_type'], string> = {
  tool_use: 'text-yellow-400',
  assistant: 'text-cyan-400',
  tool_result: 'text-green-400',
  error: 'text-red-400',
};

function formatEventPayload(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function getEventSummary(event: ActivityEvent): string {
  switch (event.event_type) {
    case 'tool_use':
      return event.tool_name
        ? `${event.tool_name}${event.action ? `: ${event.action}` : ''}`
        : event.action || 'Tool call';
    case 'assistant':
      if (typeof event.action === 'string' && event.action) {
        return event.action.length > 120 ? event.action.slice(0, 120) + '...' : event.action;
      }
      return 'Thinking...';
    case 'tool_result':
      return event.tool_name ? `${event.tool_name} result` : 'Tool result';
    case 'error':
      return typeof event.action === 'string' && event.action ? event.action : 'Error occurred';
  }
}

/** Full activity event card with collapsible payload section. Used in the right sidebar. */
export function ActivityEventCard({ log }: { log: TaskLog }) {
  const [expanded, setExpanded] = useState(false);
  const event = extractActivityEvent(log);
  if (!event) return null;

  const payloadStr = formatEventPayload(event.payload);
  const hasPayload = payloadStr.length > 0;

  return (
    <div
      data-testid="activity-event-card"
      className={`mb-2 rounded-lg border ${eventBgColors[event.event_type]} px-3 py-2`}
    >
      <div className="flex items-start gap-2">
        <EventIcon type={event.event_type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${eventTextColors[event.event_type]}`}>
              {event.event_type}
            </span>
            <span className="text-slate-500">{event.agent_name}</span>
            <span className="ml-auto text-slate-600">{relativeTime(event.timestamp)}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-300">{getEventSummary(event)}</p>
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

        return (
          <div
            key={log.id}
            data-testid="live-activity-item"
            className="flex items-center gap-2 rounded-md bg-slate-900/30 px-2.5 py-1.5 text-xs"
          >
            <EventIcon type={event.event_type} />
            <span className={eventTextColors[event.event_type]}>
              {event.agent_name}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {getEventSummary(event)}
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
