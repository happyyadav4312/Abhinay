'use client';

import Link from 'next/link';
import { Audition, AUDITION_STATUS_LABELS, AuditionStatus } from '@/types';
import { Calendar, Video, Clock, ChevronRight } from 'lucide-react';

interface AuditionCardProps {
  audition: Audition;
  isAuthor?: boolean;
}

const STATUS_COLORS: Record<AuditionStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SUBMITTED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  UNDER_REVIEW: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export function AuditionCard({ audition, isAuthor }: AuditionCardProps) {
  const deadlineStr = audition.deadline
    ? new Date(audition.deadline).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Link
      href={`/auditions/${audition.id}`}
      className="block group p-5 rounded-2xl bg-stone-900/70 border border-stone-800/80 hover:border-amber-500/40 hover:bg-stone-900 transition-all shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                STATUS_COLORS[audition.status]
              }`}
            >
              {AUDITION_STATUS_LABELS[audition.status]}
            </span>
            {audition.submissions.length > 0 && (
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <Video className="h-3 w-3" />
                <span>
                  {audition.submissions.length}{' '}
                  {audition.submissions.length === 1 ? 'take' : 'takes'}
                </span>
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-stone-100 group-hover:text-amber-400 transition-colors truncate">
            {audition.castingRoleTitle}
          </h3>

          <p className="text-xs text-stone-400 mt-1 line-clamp-2">
            {audition.instructions}
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-stone-400">
            {isAuthor ? (
              <span>Applicant: {audition.applicant.name}</span>
            ) : (
              <span>Requested by: {audition.roleAuthor.name}</span>
            )}

            {deadlineStr && (
              <span className="flex items-center gap-1 text-stone-400">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                <span>Deadline: {deadlineStr}</span>
              </span>
            )}

            <span className="flex items-center gap-1 text-stone-400">
              <Clock className="h-3.5 w-3.5 text-stone-400" />
              <span>
                {new Date(audition.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </span>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-stone-400 group-hover:text-stone-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
    </Link>
  );
}
