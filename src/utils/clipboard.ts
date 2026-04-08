/**
 * Copy text to clipboard with fallback for non-secure contexts (HTTP).
 * navigator.clipboard requires HTTPS or localhost; the fallback uses
 * a temporary textarea + execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for HTTP / non-secure contexts.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const success = document.execCommand('copy');
    if (!success) {
      throw new Error('execCommand copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
