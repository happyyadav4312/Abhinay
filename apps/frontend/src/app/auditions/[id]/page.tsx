'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/common/RequireAuth';
import { SiteHeader } from '@/components/common/SiteHeader';
import { VideoUpload } from '@/components/auditions/VideoUpload';
import { SubmissionPlayer } from '@/components/auditions/SubmissionPlayer';
import { Avatar } from '@/components/common/Avatar';
import { auditionApi, chatApi } from '@/lib/api';
import { Audition, AuditionStatus, AUDITION_STATUS_LABELS, ROLE_LABELS } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import { Button, buttonVariants } from '@/components/ui';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_BADGES: Record<AuditionStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SUBMITTED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  UNDER_REVIEW: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function AuditionDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const auditionId = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [audition, setAudition] = useState<Audition | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudition = useCallback(() => {
    auditionApi
      .getAudition(auditionId)
      .then((res) => setAudition(res.audition))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Audition not found';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [auditionId]);

  useEffect(() => {
    fetchAudition();
  }, [fetchAudition]);

  const handleUpload = async (file: File, note?: string) => {
    await auditionApi.submitVideo(auditionId, file, note);
    fetchAudition();
  };

  const handleUpdateStatus = async (status: AuditionStatus) => {
    setStatusUpdating(true);
    try {
      const res = await auditionApi.updateStatus(auditionId, status);
      setAudition(res.audition);
    } catch {
      // Handled
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleStartChat = async () => {
    if (!audition) return;
    setStartingChat(true);
    try {
      const res = await chatApi.createConversation({
        applicationId: audition.applicationId,
      });
      router.push(`/messages/${res.conversation.id}`);
    } catch {
      setStartingChat(false);
    }
  };

  if (loading) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
          <SiteHeader />
          <div className="flex-1 flex items-center justify-center">
            <Spinner className="h-8 w-8 text-amber-500" />
          </div>
        </div>
      </RequireAuth>
    );
  }

  if (error || !audition) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
          <SiteHeader />
          <div className="flex-1 max-w-xl mx-auto px-4 py-16 text-center space-y-4">
            <h2 className="text-xl font-bold text-stone-200">Audition Not Found</h2>
            <p className="text-sm text-stone-400">{error || 'This audition does not exist.'}</p>
            <Link
              href="/auditions"
              className={buttonVariants({ variant: 'outline', className: 'border-stone-800 text-stone-300' })}
            >
              Back to Auditions
            </Link>
          </div>
        </div>
      </RequireAuth>
    );
  }

  const isApplicant = user?.id === audition.applicant.id;
  const isAuthor = user?.id === audition.roleAuthor.id;

  const deadlineFormatted = audition.deadline
    ? new Date(audition.deadline).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-8">
          {/* Back link & Actions */}
          <div className="flex items-center justify-between gap-4">
            <Link
              href={isApplicant ? '/auditions' : `/casting/${audition.castingRoleId}/applicants`}
              className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Link>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartChat}
                disabled={startingChat}
                className="border-stone-800 text-stone-300 hover:text-white text-xs gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                <span>{startingChat ? 'Connecting...' : 'Live Chat'}</span>
              </Button>

              <Link
                href={`/casting/${audition.castingRoleId}`}
                target="_blank"
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'border-stone-800 text-stone-300 hover:text-white text-xs gap-1.5',
                })}
              >
                <span>View Role</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Header Card */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-800">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  STATUS_BADGES[audition.status]
                }`}
              >
                {AUDITION_STATUS_LABELS[audition.status]}
              </span>

              <div className="flex items-center gap-4 text-xs text-stone-400">
                {deadlineFormatted && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-amber-500" />
                    <span>Deadline: {deadlineFormatted}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-stone-400" />
                  <span>
                    Requested{' '}
                    {new Date(audition.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-100">
                {audition.castingRoleTitle}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <Avatar
                  name={isAuthor ? audition.applicant.name : audition.roleAuthor.name}
                  photoUrl={isAuthor ? audition.applicant.photoUrl : null}
                  size="sm"
                />
                <div className="text-xs">
                  <span className="text-stone-400">
                    {isAuthor ? 'Applicant: ' : 'Director / Producer: '}
                  </span>
                  <span className="font-semibold text-stone-200">
                    {isAuthor ? audition.applicant.name : audition.roleAuthor.name}
                  </span>
                  {isAuthor && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                      {ROLE_LABELS[audition.applicant.role]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Audition Instructions</span>
              </div>
              <p className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                {audition.instructions}
              </p>
            </div>
          </div>

          {/* Video Upload Section for Applicant */}
          {isApplicant && (
            <div className="space-y-4">
              <VideoUpload onUpload={handleUpload} />
            </div>
          )}

          {/* Submissions List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-100">
                Submissions ({audition.submissions.length})
              </h2>
            </div>

            {audition.submissions.length === 0 ? (
              <div className="p-8 rounded-2xl border border-stone-800/80 bg-stone-900/30 text-center text-xs text-stone-400">
                No self-tape videos submitted yet.
              </div>
            ) : (
              <div className="space-y-6">
                {audition.submissions.map((sub, index) => (
                  <SubmissionPlayer
                    key={sub.id}
                    submission={sub}
                    index={index}
                    totalSubmissions={audition.submissions.length}
                    isAuthor={isAuthor}
                    currentStatus={audition.status}
                    onUpdateStatus={handleUpdateStatus}
                    statusUpdating={statusUpdating}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
