'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { loginFormSchema, type LoginFormValues } from '@/lib/validation';
import { safeReturnTo } from '@/components/common';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

function LoginForm() {
  const { login, isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const destination = safeReturnTo(searchParams.get('returnTo')) ?? '/dashboard';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace(destination);
  }, [isAuthenticated, isInitializing, destination, router]);

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);

    try {
      await login(values.email, values.password);
      router.replace(destination);
    } catch (error) {
      if (error instanceof ApiError) {
        // Map server field errors onto the matching controls; anything without
        // a field lands in the form-level alert.
        const entries = Object.entries(error.fieldErrors);
        for (const [field, messages] of entries) {
          if (field === 'email' || field === 'password') {
            setError(field, { message: messages[0] });
          }
        }
        if (entries.length === 0) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      // The email is left in place so a failed attempt does not force a retype.
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mb-6 text-sm text-zinc-400">Welcome back to Abhinay.</p>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {formError ? <Alert>{formError}</Alert> : null}

          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </Field>

          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </Field>

          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-zinc-400">
        New to Abhinay?{' '}
        <Link href="/register" className="text-brand-400 underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary during prerendering.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
