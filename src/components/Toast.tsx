import { useEffect, useState, useCallback } from 'react';
import { generateId } from '../utils/id';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

let addToastFn: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;

export function toast(type: ToastMessage['type'], text: string) {
  addToastFn?.({ type, text });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = generateId();
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const colorMap = {
    success: 'border-green-500/30 bg-green-500/10 text-green-400',
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-in rounded-lg border px-4 py-3 text-sm shadow-lg ${colorMap[t.type]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
