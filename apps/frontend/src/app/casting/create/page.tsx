'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { castingApi } from '@/lib/api';
import { MessageCard, RequireAuth } from '@/components/common';
import { BLANK_CASTING_ROLE, CastingRoleForm } from '@/components/casting';
import { buttonVariants, Card, CardContent } from '@/components/ui';
import { canPostCasting, type CastingRoleInput } from '@/types';

function CreateCastingRole() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) return null;

  // UX only: the API independently answers 403 for any other role.
  if (!canPostCasting(user.role)) {
    return (
      <MessageCard
        title="Producers and directors only"
        action={
          <Link href="/casting" className={buttonVariants({ variant: 'outline' })}>
            Browse casting calls
          </Link>
        }
      >
        Only producers and directors can post casting roles. You can browse every open role.
      </MessageCard>
    );
  }

  async function handleSubmit(input: CastingRoleInput, intent: string) {
    const { castingRole } = await castingApi.create(input);

    if (intent === 'publish') {
      try {
        await castingApi.setStatus(castingRole.id, 'OPEN');
      } catch {
        // The draft exists; say so on its page rather than pretending nothing happened.
        router.replace(`/casting/${castingRole.id}?notice=publish-failed`);
        return;
      }
      router.replace(`/casting/${castingRole.id}?notice=published`);
      return;
    }

    router.replace(`/casting/${castingRole.id}?notice=created`);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Post a casting role</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Save it as a draft to review privately, or publish it so everyone on Abhinay can find it.
        </p>
      </div>

      <Card>
        <CardContent>
          <CastingRoleForm
            ariaLabel="New casting role"
            defaultValues={BLANK_CASTING_ROLE}
            actions={[
              { intent: 'publish', label: 'Publish role', pendingLabel: 'Publishing…' },
              {
                intent: 'draft',
                label: 'Save as draft',
                pendingLabel: 'Saving…',
                variant: 'secondary',
              },
            ]}
            defaultIntent="draft"
            onSubmit={handleSubmit}
            onCancel={() => router.push('/casting')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreateCastingRolePage() {
  return (
    <RequireAuth>
      <CreateCastingRole />
    </RequireAuth>
  );
}
