const ERROR_MAP: Record<string, string> = {
  'stop the team before deleting': 'You must stop the team before deleting it.',
  'team is already running': 'This team is already running.',
  'team is already stopped': 'This team is already stopped.',
  'team is currently deploying': 'This team is currently deploying. Please wait.',
  'team must be running to chat': 'The team must be running before you can send messages.',
  'message is required': 'Please enter a message before sending.',
  'name is required': 'A name is required.',
  'team not found': 'Team not found. It may have been deleted.',
  'agent not found': 'Agent not found. It may have been removed.',
  'team name already exists': 'A team with that name already exists. Please choose a different name.',
};

/**
 * Converts a raw API error message into a user-friendly string.
 * Falls back to a generic message if the error is unrecognized.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (!raw) return fallback;

  const lower = raw.toLowerCase().trim();
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (lower.includes(key)) return friendly;
  }

  // If the message looks like raw JSON or a status code, use fallback
  if (raw.startsWith('{') || raw.startsWith('Request failed:')) return fallback;

  // Otherwise the message is already human-readable enough
  return raw;
}
