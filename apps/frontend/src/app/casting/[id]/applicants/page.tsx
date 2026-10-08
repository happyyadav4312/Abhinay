'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, castingApi, shortlistApi, type ApplicantPage } from '@/lib/api';
import {
  LIMITS,
  shortlistFolderFormSchema,
  type ShortlistFolderFormValues,
} from '@/lib/validation';
import { cn } from '@/lib/utils';
import { Avatar, ErrorState, LoadingState, MessageCard, RequireAuth } from '@/components/common';
import { ApplicationStatusBadge, formatDate, Pager } from '@/components/casting';
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
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Shortlist folders
          </h2>
          <p className="text-sm text-zinc-400">
            Sort applicants into your own folders. Folders are private to you, and filing someone
            does not notify them or change their application status.
          </p>
        </div>

        <nav aria-label="Filter applicants by folder" className="flex flex-wrap gap-1.5">
          <Link
            href={hrefFor()}
            aria-current={!activeFolderId ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              !activeFolderId
                ? 'border-primary bg-primary/15 text-zinc-100'
                : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800/60'
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
                'rounded-full border px-3 py-1 text-sm',
                folder.id === activeFolderId
                  ? 'border-primary bg-primary/15 text-zinc-100'
                  : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800/60'
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
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 p-3">
            <p className="text-sm text-zinc-200">
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
          <p className="text-sm text-zinc-500">
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
  onToggle,
}: {
  applicant: Applicant;
  folders: ShortlistFolder[];
  pendingFolderId: string | null;
  onToggle: (folder: ShortlistFolder, filed: boolean) => void;
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
                <h3 className="font-medium text-zinc-100">
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
              <p className="text-sm text-zinc-400">
                {ROLE_LABELS[person.role]}
                {person.location ? ` · ${person.location}` : ''} · Applied{' '}
                {formatDate(applicant.appliedAt)}
              </p>
            </div>
          </div>

          {folders.length > 0 ? (
            <div
              role="group"
              aria-label={`Folders for ${person.name}`}
              className="flex flex-wrap gap-1.5"
            >
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
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60',
                      filed
                        ? 'border-primary bg-primary/20 text-zinc-100'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    )}
                  >
                    {pending ? '…' : filed ? '✓ ' : '+ '}
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
  const [actionError, setActionError] = useState<string | null>(null);

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
              onToggle={(folder, filed) => void toggle(applicant, folder, filed)}
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
      <Link href={`/casting/${role.id}`} className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Back to the role
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Applicants</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {role.title} · casting for {ROLE_LABELS[role.seekingRole]}
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
