'use client';

import { AuditionSubmission, AuditionStatus } from '@/types';
import { Clock, FileText, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubmissionPlayerProps {
  submission: AuditionSubmission;
  index: number;
  totalSubmissions: number;
  isAuthor?: boolean;
  currentStatus?: AuditionStatus;
  onUpdateStatus?: (status: AuditionStatus) => Promise<void>;
  statusUpdating?: boolean;
}

export function SubmissionPlayer({
  submission,
  index,
  totalSubmissions,
  isAuthor,
  currentStatus,
  onUpdateStatus,
  statusUpdating,
}: SubmissionPlayerProps) {
  const formattedTime = new Date(submission.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 overflow-hidden space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-stone-300">
            Take {totalSubmissions - index}
          </span>
          <span className="text-xs text-stone-400">{formattedTime}</span>
        </div>
        {submission.durationSeconds && (
          <span className="text-xs text-stone-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{Math.round(submission.durationSeconds)}s</span>
          </span>
        )}
      </div>

      {/* Video player */}
      <div className="px-4">
        <div className="rounded-xl overflow-hidden bg-black border border-stone-800/80 aspect-video max-h-[420px] flex items-center justify-center">
          <video
            src={submission.url}
            poster={submission.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Note & Actions footer */}
      <div className="p-4 pt-1 space-y-3">
        {submission.note && (
          <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800 text-xs text-stone-300 flex items-start gap-2">
            <FileText className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="whitespace-pre-wrap">{submission.note}</p>
          </div>
        )}

        {isAuthor && onUpdateStatus && (
          <div className="pt-2 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-stone-400">
              Current status:{' '}
              <span className="font-semibold text-stone-200">
                {currentStatus?.replace('_', ' ')}
              </span>
            </span>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={statusUpdating || currentStatus === 'UNDER_REVIEW'}
                onClick={() => onUpdateStatus('UNDER_REVIEW')}
                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10 text-xs"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Under Review
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={statusUpdating || currentStatus === 'APPROVED'}
                onClick={() => onUpdateStatus('APPROVED')}
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={statusUpdating || currentStatus === 'REJECTED'}
                onClick={() => onUpdateStatus('REJECTED')}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
