'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, MessageSquare, Plus, Video } from 'lucide-react';
import { ApiError, castingApi, chatApi, shortlistApi, type ApplicantPage } from '@/lib/api';
import {
  LIMITS,
  shortlistFolderFormSchema,
  type ShortlistFolderFormValues,
} from '@/lib/validation';
import { cn } from '@/lib/utils';
import { Avatar, ErrorState, LoadingState, MessageCard, RequireAuth } from '@/components/common';
import { ApplicationStatusBadge, formatDate, Pager } from '@/components/casting';
import { RequestAuditionModal } from '@/components/auditions/RequestAuditionModal';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
} from '@/components/ui';
import { ROLE_LABELS, type Applicant, type CastingRole, type ShortlistFolder } from '@/types';

type RoleLoad = { key: string } & (
  | { status: 'ready'; role: CastingRole; folders: ShortlistFolder[] }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
);

type ApplicantsLoad = { key: string } & (
  { ok: true; page: ApplicantPage } | { ok: false; message: string }
);

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

// ── Folder name form (create and rename) ────────────────

function FolderNameForm({
  id,
  label,
  submitLabel,
  pendingLabel,
  initialName = '',
  onSubmit,
  onCancel,
}: {
  id: string;
  label: string;
  submitLabel: string;
  pendingLabel: string;
  initialName?: string;
  /** Throw an ApiError to have its message shown on the field. */
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ShortlistFolderFormValues>({
    resolver: zodResolver(shortlistFolderFormSchema),
    defaultValues: { name: initialName },
  });

  return (
    // No aria-label: the single field's label already names what the form does.
    <form
      noValidate
      className="flex flex-wrap items-start gap-2"
      onSubmit={handleSubmit(async ({ name }) => {
        try {
          await onSubmit(name.trim());
          reset({ name: '' });
        } catch (caught) {
          setError('name', {
            message:
              caught instanceof ApiError
                ? (caught.fieldErrors.name?.[0] ?? caught.message)
                : 'Something went wrong. Please try again.',
          });
        }
      })}
    >
      <Field label={label} htmlFor={id} error={errors.name?.message} className="min-w-48 flex-1">
        <Input
          id={id}
          maxLength={LIMITS.SHORTLIST_FOLDER_NAME_MAX + 10}
          placeholder="e.g. Callbacks"
          aria-invalid={Boolean(errors.name)}
          {...register('name')}
        />
      </Field>
      <div className="flex gap-2 sm:mt-5">
        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? pendingLabel : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

// ── Folder bar ──────────────────────────────────────────

function FolderBar({
  roleId,
  folders,
  total,
  activeFolderId,
  onCreated,
  onRenamed,
  onDeleted,
}: {
  roleId: string;
  folders: ShortlistFolder[];
  /** Applicants across all folders, when known. */
  total: number | null;
  activeFolderId: string | undefined;
  onCreated: (folder: ShortlistFolder) => void;
  onRenamed: (folder: ShortlistFolder) => void;
  onDeleted: (folderId: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const active = folders.find((folder) => folder.id === activeFolderId);

  useEffect(() => {
    if (mode === 'delete') confirmRef.current?.focus();
  }, [mode]);

  const hrefFor = (folderId?: string) =>
    folderId ? `/casting/${roleId}/applicants?folder=${folderId}` : `/casting/${roleId}/applicants`;

  async function deleteActive() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await shortlistApi.deleteFolder(roleId, active.id);
      setMode('idle');
      onDeleted(active.id);
    } catch (caught) {
      setError(messageOf(caught, 'Could not delete the folder.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-medium text-foreground">
            Shortlist folders
          </h2>
          <p className="text-sm text-muted-foreground">
            Sort applicants into your own folders. Folders are private to you, and filing someone
            does not notify them or change their application status.
          </p>
        </div>

        <nav aria-label="Filter applicants by folder" className="flex flex-wrap gap-1.5">
          <Link
            href={hrefFor()}
            aria-current={!activeFolderId ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              !activeFolderId
                ? 'border-primary bg-primary/20 text-foreground font-medium shadow-2xs'
                : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            All applicants{total !== null ? ` (${total})` : ''}
          </Link>
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={hrefFor(folder.id)}
              aria-current={folder.id === activeFolderId ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                folder.id === activeFolderId
                  ? 'border-primary bg-primary/20 text-foreground font-medium shadow-2xs'
                  : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {folder.name} ({folder.applicantCount})
            </Link>
          ))}
        </nav>

        {error ? <Alert>{error}</Alert> : null}

        {active && mode === 'rename' ? (
          <FolderNameForm
            key={active.id}
            id="rename-folder"
            label={`Rename “${active.name}”`}
            submitLabel="Save name"
            pendingLabel="Saving…"
            initialName={active.name}
            onCancel={() => setMode('idle')}
            onSubmit={async (name) => {
              const { folder } = await shortlistApi.renameFolder(roleId, active.id, name);
              onRenamed(folder);
              setMode('idle');
            }}
          />
        ) : active && mode === 'delete' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4">
            <p className="text-sm text-foreground font-medium">
              Delete the folder “{active.name}”? The applicants in it stay on your list; only the
              folder goes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                ref={confirmRef}
                variant="destructive"
                isLoading={busy}
                onClick={deleteActive}
              >
                Yes, delete folder
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setMode('idle')}>
                Cancel
              </Button>
            </div>
          </div>
        ) : active ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode('rename')}>
              Rename folder
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setMode('delete')}>
              Delete folder
            </Button>
          </div>
        ) : folders.length >= LIMITS.SHORTLIST_FOLDERS_PER_ROLE_MAX ? (
          <p className="text-sm text-muted-foreground">
            You have reached the limit of {LIMITS.SHORTLIST_FOLDERS_PER_ROLE_MAX} folders for this
            role.
          </p>
        ) : (
          <FolderNameForm
            id="new-folder"
            label="New folder"
            submitLabel="Create folder"
            pendingLabel="Creating…"
            onSubmit={async (name) => {
              const { folder } = await shortlistApi.createFolder(roleId, name);
              onCreated(folder);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── One applicant ───────────────────────────────────────

function ApplicantCard({
  applicant,
  folders,
  pendingFolderId,
  isUpdatingStatus,
  onToggle,
  onUpdateStatus,
  onStartChat,
  onRequestAudition,
}: {
  applicant: Applicant;
  folders: ShortlistFolder[];
  pendingFolderId: string | null;
  isUpdatingStatus: boolean;
  onToggle: (folder: ShortlistFolder, filed: boolean) => void;
  onUpdateStatus: (status: 'SHORTLISTED' | 'SELECTED' | 'REJECTED') => void;
  onStartChat: () => void;
  onRequestAudition: () => void;
}) {
  const person = applicant.applicant;

  return (
    <li>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={person.name} photoUrl={person.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-foreground">
                  {person.profileId ? (
                    <Link
                      href={`/profile/${person.profileId}`}
                      className="underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {person.name}
                    </Link>
                  ) : (
                    person.name
                  )}
                </h3>
                <ApplicationStatusBadge status={applicant.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {ROLE_LABELS[person.role]}
                {person.location ? ` · ${person.location}` : ''} · Applied{' '}
                {formatDate(applicant.appliedAt)}
              </p>
            </div>
          </div>

          {/* Status workflow actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1">Move status:</span>
              {applicant.status !== 'SHORTLISTED' && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => onUpdateStatus('SHORTLISTED')}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  Shortlist
                </button>
              )}
              {applicant.status !== 'SELECTED' && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => onUpdateStatus('SELECTED')}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  Select
                </button>
              )}
              {applicant.status !== 'REJECTED' && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => onUpdateStatus('REJECTED')}
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  Reject
                </button>
              )}
              {isUpdatingStatus && (
                <span className="text-xs text-muted-foreground animate-pulse ml-1">Updating…</span>
              )}
            </div>

            {/* Direct message & Audition triggers for Shortlisted or Selected */}
            {(applicant.status === 'SHORTLISTED' || applicant.status === 'SELECTED') && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onStartChat}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={onRequestAudition}
                  className="inline-flex items-center gap-1 rounded-md border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
                >
                  <Video className="h-3 w-3" />
                  Audition
                </button>
              </div>
            )}
          </div>

          {folders.length > 0 ? (
            <div
              role="group"
              aria-label={`Folders for ${person.name}`}
              className="flex flex-wrap items-center gap-1.5 pt-1"
            >
              <span className="text-xs font-medium text-muted-foreground mr-1 self-center">Folder:</span>
              {folders.map((folder) => {
                const filed = applicant.folderIds.includes(folder.id);
                const pending = pendingFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    aria-pressed={filed}
                    disabled={pendingFolderId !== null}
                    onClick={() => onToggle(folder, filed)}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                      filed
                        ? 'border-primary bg-primary/20 text-foreground font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {pending ? (
                      '… '
                    ) : filed ? (
                      <Check className="h-3 w-3 mr-1 shrink-0 text-primary" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1 shrink-0" />
                    )}
                    {folder.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

// ── Page ────────────────────────────────────────────────

function Applicants({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderParam = searchParams.get('folder') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [roleReload, setRoleReload] = useState(0);
  const [roleLoad, setRoleLoad] = useState<RoleLoad | null>(null);
  const [listReload, setListReload] = useState(0);
  const [listLoad, setListLoad] = useState<ApplicantsLoad | null>(null);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [pending, setPending] = useState<{ applicationId: string; folderId: string } | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [auditionApplicant, setAuditionApplicant] = useState<Applicant | null>(null);

  async function startChat(applicant: Applicant) {
    try {
      const res = await chatApi.createConversation({
        applicationId: applicant.applicationId,
      });
      router.push(`/messages/${res.conversation.id}`);
    } catch (caught) {
      setActionError(messageOf(caught, 'Could not start chat. Please try again.'));
    }
  }

  const roleKey = `${id}|${roleReload}`;
  const listKey = `${id}|${folderParam ?? ''}|${page}|${listReload}`;

  // The role (to check ownership and show its title) and its folders.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${id}|${roleReload}`;

    Promise.all([
      castingApi.get(id, controller.signal),
      shortlistApi.folders(id, controller.signal),
    ])
      .then(([{ castingRole }, { folders }]) => {
        if (!controller.signal.aborted) {
          setRoleLoad({ key, status: 'ready', role: castingRole, folders });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // 404: no such role, or not yours. 403: not a producer or director.
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) {
          setRoleLoad({ key, status: 'notFound' });
          return;
        }
        setRoleLoad({
          key,
          status: 'error',
          message: messageOf(caught, 'Could not load this role.'),
        });
      });

    return () => controller.abort();
  }, [id, roleReload]);

  // The applicants, for the selected folder and page.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${id}|${folderParam ?? ''}|${page}|${listReload}`;

    shortlistApi
      .applicants(id, { folderId: folderParam, page }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setListLoad({ key, ok: true, page: result });
        if (!folderParam) setAllTotal(result.pagination.total);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setListLoad({ key, ok: false, message: messageOf(caught, 'Could not load applicants.') });
      });

    return () => controller.abort();
  }, [id, folderParam, page, listReload]);

  if (roleLoad === null || roleLoad.key !== roleKey) {
    return <LoadingState label="Loading applicants…" />;
  }

  if (roleLoad.status === 'notFound' || (roleLoad.status === 'ready' && !roleLoad.role.isOwner)) {
    return (
      <MessageCard
        title="Applicants not available"
        action={
          <Link href="/casting" className={buttonVariants({ variant: 'outline' })}>
            Browse casting calls
          </Link>
        }
      >
        Only the producer or director who posted a casting role can review its applicants.
      </MessageCard>
    );
  }

  if (roleLoad.status === 'error') {
    return (
      <ErrorState message={roleLoad.message} onRetry={() => setRoleReload((token) => token + 1)} />
    );
  }

  const { role, folders } = roleLoad;
  const activeFolder = folders.find((folder) => folder.id === folderParam);

  function setFolders(next: ShortlistFolder[]) {
    setRoleLoad({ key: roleKey, status: 'ready', role, folders: next });
  }

  function adjustCount(folderId: string, delta: number) {
    setFolders(
      folders.map((folder) =>
        folder.id === folderId
          ? { ...folder, applicantCount: Math.max(0, folder.applicantCount + delta) }
          : folder
      )
    );
  }

  async function toggle(applicant: Applicant, folder: ShortlistFolder, filed: boolean) {
    setPending({ applicationId: applicant.applicationId, folderId: folder.id });
    setActionError(null);
    try {
      if (filed) {
        await shortlistApi.unfile(role.id, folder.id, applicant.applicationId);
        adjustCount(folder.id, -1);
        if (folder.id === folderParam) {
          // It no longer belongs in this filtered view.
          setListReload((token) => token + 1);
          return;
        }
        replaceApplicant({
          ...applicant,
          folderIds: applicant.folderIds.filter((folderId) => folderId !== folder.id),
        });
      } else {
        const { applicant: updated } = await shortlistApi.file(
          role.id,
          folder.id,
          applicant.applicationId
        );
        if (!applicant.folderIds.includes(folder.id)) adjustCount(folder.id, 1);
        replaceApplicant(updated);
      }
    } catch (caught) {
      setActionError(messageOf(caught, 'Could not update the folder. Please try again.'));
      // A folder deleted in another tab, say: resynchronise both halves.
      if (caught instanceof ApiError && caught.status === 404) {
        setRoleReload((token) => token + 1);
        setListReload((token) => token + 1);
      }
    } finally {
      setPending(null);
    }
  }

  function replaceApplicant(updated: Applicant) {
    if (!listLoad || !listLoad.ok) return;
    setListLoad({
      ...listLoad,
      page: {
        ...listLoad.page,
        applicants: listLoad.page.applicants.map((item) =>
          item.applicationId === updated.applicationId ? updated : item
        ),
      },
    });
  }

  async function handleStatusChange(
    applicant: Applicant,
    status: 'SHORTLISTED' | 'SELECTED' | 'REJECTED'
  ) {
    if (statusPendingId) return;
    setStatusPendingId(applicant.applicationId);
    setActionError(null);
    try {
      const { applicant: updated } = await castingApi.updateApplicationStatus(
        role.id,
        applicant.applicationId,
        status
      );
      replaceApplicant(updated);
    } catch (caught) {
      setActionError(messageOf(caught, 'Could not update applicant status. Please try again.'));
    } finally {
      setStatusPendingId(null);
    }
  }

  let body: React.ReactNode;
  if (listLoad === null || listLoad.key !== listKey) {
    body = <LoadingState label="Loading applicants…" />;
  } else if (!listLoad.ok) {
    body = (
      <ErrorState message={listLoad.message} onRetry={() => setListReload((token) => token + 1)} />
    );
  } else if (listLoad.page.applicants.length === 0) {
    body = activeFolder ? (
      <EmptyState>
        No applicants in “{activeFolder.name}” yet. Use the folder buttons on an applicant to file
        them here.
      </EmptyState>
    ) : (
      <EmptyState>
        {role.status === 'DRAFT'
          ? 'This role is still a draft. Publish it to start receiving applications.'
          : 'Nobody has applied to this role yet.'}
      </EmptyState>
    );
  } else {
    const { applicants, pagination } = listLoad.page;
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {applicants.map((applicant) => (
            <ApplicantCard
              key={applicant.applicationId}
              applicant={applicant}
              folders={folders}
              pendingFolderId={
                pending?.applicationId === applicant.applicationId ? pending.folderId : null
              }
              isUpdatingStatus={statusPendingId === applicant.applicationId}
              onToggle={(folder, filed) => void toggle(applicant, folder, filed)}
              onUpdateStatus={(status) => void handleStatusChange(applicant, status)}
              onStartChat={() => void startChat(applicant)}
              onRequestAudition={() => setAuditionApplicant(applicant)}
            />
          ))}
        </ul>
        <Pager
          pagination={pagination}
          hrefFor={(target) => {
            const search = new URLSearchParams();
            if (folderParam) search.set('folder', folderParam);
            if (target > 1) search.set('page', String(target));
            const query = search.toString();
            return `/casting/${role.id}/applicants${query ? `?${query}` : ''}`;
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/casting/${role.id}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        ← Back to the role
      </Link>

      <header>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Applicants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role.title} · casting for <span className="font-medium text-primary">{ROLE_LABELS[role.seekingRole]}</span>
        </p>
      </header>

      {folderParam && !activeFolder ? (
        <Alert tone="info">
          That folder no longer exists.{' '}
          <Link href={`/casting/${role.id}/applicants`} className="underline underline-offset-4">
            Show all applicants
          </Link>
        </Alert>
      ) : null}

      <FolderBar
        roleId={role.id}
        folders={folders}
        total={allTotal}
        activeFolderId={activeFolder?.id}
        onCreated={(folder) => setFolders([...folders, folder])}
        onRenamed={(folder) =>
          setFolders(folders.map((item) => (item.id === folder.id ? folder : item)))
        }
        onDeleted={(folderId) => {
          setFolders(folders.filter((folder) => folder.id !== folderId));
          router.replace(`/casting/${role.id}/applicants`);
          setListReload((token) => token + 1);
        }}
      />

      {actionError ? <Alert>{actionError}</Alert> : null}

      <section aria-label={activeFolder ? `Applicants in ${activeFolder.name}` : 'All applicants'}>
        <div className="flex flex-col gap-3">{body}</div>
      </section>

      {auditionApplicant && (
        <RequestAuditionModal
          open={Boolean(auditionApplicant)}
          onClose={() => setAuditionApplicant(null)}
          castingRoleId={role.id}
          applicationId={auditionApplicant.applicationId}
          applicantName={auditionApplicant.applicant.name}
          onSuccess={() => {
            setListReload((token) => token + 1);
          }}
        />
      )}
    </div>
  );
}

export default function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  // `params` is a Promise in Next.js 16; `use()` unwraps it in a Client Component.
  const { id } = use(params);

  return (
    <RequireAuth>
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={<LoadingState label="Loading applicants…" />}>
        <Applicants id={id} />
      </Suspense>
    </RequireAuth>
  );
}
