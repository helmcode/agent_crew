/**
 * Converts a cron expression into a human-readable string.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */
export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dom, month, dow] = parts;

  // Every minute
  if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Every minute';
  }

  // Every N minutes
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = minute.slice(2);
    return `Every ${n} minutes`;
  }

  // Every hour at :MM
  if (minute !== '*' && !minute.includes('/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every hour at :${minute.padStart(2, '0')}`;
  }

  // Every N hours
  if (minute !== '*' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    const n = hour.slice(2);
    return `Every ${n} hours at :${minute.padStart(2, '0')}`;
  }

  // Daily at HH:MM
  if (minute !== '*' && hour !== '*' && !hour.includes('/') && !hour.includes(',') && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Weekly on specific days
  if (minute !== '*' && hour !== '*' && !hour.includes('/') && dom === '*' && month === '*' && dow !== '*') {
    const dayNames: Record<string, string> = {
      '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed',
      '4': 'Thu', '5': 'Fri', '6': 'Sat',
      'SUN': 'Sun', 'MON': 'Mon', 'TUE': 'Tue', 'WED': 'Wed',
      'THU': 'Thu', 'FRI': 'Fri', 'SAT': 'Sat',
    };
    const days = dow.split(',').map((d) => dayNames[d.toUpperCase()] ?? d).join(', ');
    return `${days} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Monthly on specific day
  if (minute !== '*' && hour !== '*' && dom !== '*' && !dom.includes('/') && month === '*' && dow === '*') {
    const suffix = getOrdinalSuffix(parseInt(dom, 10));
    return `Monthly on the ${dom}${suffix} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
