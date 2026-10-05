import type { ReactNode } from 'react';
import { Alert, Button, Card, CardContent, Spinner } from '@/components/ui';

/** Full-width loading placeholder with an accessible label. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status">
      <Spinner className="h-6 w-6 text-primary" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A failed load the user can retry without reloading the page. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert>{message}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * A centred explanation with an optional way out — used for not-found and
 * not-allowed states, so a dead end always says why and where to go next.
 */
export function MessageCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardContent>
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{children}</p>
        {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
