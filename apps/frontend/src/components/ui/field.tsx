import { ReactNode } from 'react';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className={cn('text-zinc-200', error && 'text-red-500')}>
        {label}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-[0.8rem] text-zinc-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[0.8rem] font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
