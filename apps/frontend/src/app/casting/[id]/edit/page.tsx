'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, castingApi } from '@/lib/api';
import { ErrorState, LoadingState, MessageCard, RequireAuth } from '@/components/common';
import { CastingRoleForm, castingRoleToFormValues } from '@/components/casting';
import { buttonVariants, Card, CardContent } from '@/components/ui';
import type { CastingRole, CastingRoleInput } from '@/types';

type LoadResult = { key: string } & (
  | { status: 'ready'; role: CastingRole }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
);

function EditCastingRole({ id }: { id: string }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // State is only ever set from the promise callbacks; loading is derived.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${id}|${reloadToken}`;

    castingApi
      .get(id, controller.signal)
      .then(({ castingRole }) => {
        if (!controller.signal.aborted) setResult({ key, status: 'ready', role: castingRole });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setResult({ key, status: 'notFound' });
          return;
        }
        setResult({
          key,
          status: 'error',
          message:
            caught instanceof ApiError ? caught.message : 'Could not load this casting role.',
        });
      });

    return () => controller.abort();
  }, [id, reloadToken]);

  if (result === null || result.key !== `${id}|${reloadToken}`) {
    return <LoadingState label="Loading casting role…" />;
  }

  if (result.status === 'notFound') {
    return (
      <MessageCard
        title="Casting role not found"
        action={
          <Link href="/casting/mine" className={buttonVariants({ variant: 'outline' })}>
            My postings
          </Link>
        }
      >
        This casting role does not exist, or it is not yours to edit.
      </MessageCard>
    );
  }

  if (result.status === 'error') {
    return (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  }

  const { role } = result;
  const backToRole = (
    <Link href={`/casting/${role.id}`} className={buttonVariants({ variant: 'outline' })}>
      Back to the role
    </Link>
  );

  // UX only: the API independently refuses both cases.
  if (!role.isOwner) {
    return (
      <MessageCard title="You can’t edit this role" action={backToRole}>
        Only the producer or director who posted a casting role can edit it.
      </MessageCard>
    );
  }
  if (role.status === 'CLOSED') {
    return (
      <MessageCard title="This role is closed" action={backToRole}>
        Closed casting roles can no longer be edited.
      </MessageCard>
    );
  }

  async function handleSubmit(input: CastingRoleInput) {
    await castingApi.update(role.id, input);
    router.replace(`/casting/${role.id}?notice=updated`);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit casting role</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {role.status === 'OPEN'
            ? 'This role is live: changes are visible as soon as you save.'
            : 'This role is a draft: only you can see it.'}
        </p>
      </div>

      <Card>
        <CardContent>
          <CastingRoleForm
            ariaLabel="Edit casting role"
            defaultValues={castingRoleToFormValues(role)}
            savedDeadline={role.applicationDeadline}
            actions={[{ intent: 'save', label: 'Save changes', pendingLabel: 'Saving…' }]}
            defaultIntent="save"
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/casting/${role.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditCastingRolePage({ params }: { params: Promise<{ id: string }> }) {
  // `params` is a Promise in Next.js 16; `use()` unwraps it in a Client Component.
  const { id } = use(params);

  return (
    <RequireAuth>
      <EditCastingRole id={id} />
    </RequireAuth>
  );
}
