'use client';

import { useState } from 'react';
import { auditionApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Video, X } from 'lucide-react';

interface RequestAuditionModalProps {
  open: boolean;
  onClose: () => void;
  castingRoleId: string;
  applicationId: string;
  applicantName: string;
  onSuccess: () => void;
}

export function RequestAuditionModal({
  open,
  onClose,
  castingRoleId,
  applicationId,
  applicantName,
  onSuccess,
}: RequestAuditionModalProps) {
  const [instructions, setInstructions] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) {
      setError('Please provide audition instructions');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await auditionApi.requestAudition({
        castingRoleId,
        applicationId,
        instructions: instructions.trim(),
        deadline: deadline || null,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to request audition. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Video className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-100">
                Request Self-Tape Audition
              </h2>
              <p className="text-xs text-stone-400">Applicant: {applicantName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Audition Instructions <span className="text-amber-500">*</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Provide scene sides, dialogue, framing instructions (medium shot, eye level), or slating requirements..."
              rows={4}
              required
              className="w-full rounded-xl bg-stone-950 border border-stone-800 px-3.5 py-2.5 text-sm text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Submission Deadline (Optional)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-xl bg-stone-950 border border-stone-800 px-3.5 py-2 text-sm text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="border-stone-800 text-stone-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !instructions.trim()}
              className="bg-amber-600 hover:bg-amber-500 text-white min-w-[120px]"
            >
              {submitting ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  <span>Requesting...</span>
                </>
              ) : (
                'Send Request'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
