import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { InvitePreview, InviteRegisterRequest } from '../types';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from '../components/Toast';
import { friendlyError } from '../utils/errors';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { registerWithInvite } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<Omit<InviteRegisterRequest, 'token'>>({
    name: '',
    email: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) return;
    authApi.inviteInfo(token)
      .then((data) => {
        setPreview(data);
        if (data.email) setForm((f) => ({ ...f, email: data.email }));
      })
      .catch((err) => setError(friendlyError(err, 'Invalid or expired invite link.')))
      .finally(() => setLoading(false));
  }, [token]);

  const passwordValid = form.password.length >= 8
    && /[A-Z]/.test(form.password)
    && /[a-z]/.test(form.password)
    && /[0-9]/.test(form.password);

  const passwordsMatch = form.password === confirmPassword;

  const canSubmit =
    form.name.trim() &&
    form.email.trim() &&
    passwordValid &&
    passwordsMatch &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      await registerWithInvite({ ...form, token });
      navigate('/', { replace: true });
    } catch (err) {
      toast('error', friendlyError(err, 'Failed to accept invite. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm text-center">
          <p className="mb-4 text-red-400">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <svg className="mb-3 h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="text-2xl font-bold text-white">Join {preview?.org_name}</h1>
          <p className="mt-1 text-sm text-slate-400">You&apos;ve been invited to join this organization</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4">
            <label htmlFor="inv_name" className="mb-1 block text-sm font-medium text-slate-300">
              Your name
            </label>
            <input
              id="inv_name"
              type="text"
              required
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Jane Doe"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="inv_email" className="mb-1 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="inv_email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!preview?.email}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="inv_password" className="mb-1 block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="inv_password"
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Min 8 chars, upper, lower, digit"
            />
            {form.password && !passwordValid && (
              <p className="mt-1 text-xs text-amber-400">
                Must be 8+ chars with uppercase, lowercase, and a digit
              </p>
            )}
          </div>

          <div className="mb-6">
            <label htmlFor="inv_confirm" className="mb-1 block text-sm font-medium text-slate-300">
              Confirm password
            </label>
            <input
              id="inv_confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              placeholder="Re-enter your password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? 'Joining...' : 'Join organization'}
          </button>
        </form>
      </div>
    </div>
  );
}
