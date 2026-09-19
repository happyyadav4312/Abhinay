'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { LIMITS, registerFormSchema, type RegisterFormValues } from '@/lib/validation';
import { Alert, Button, Card, Field, Input, NativeSelect } from '@/components/ui';
import { PUBLIC_ROLES, ROLE_LABELS, type Role } from '@/types';

export default function RegisterPage() {
  const { register: createAccount, isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', role: 'ACTOR' },
  });

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, isInitializing, router]);

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);

    try {
      // confirmPassword is intentionally dropped — it exists only in this form.
      await createAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role as Exclude<Role, 'ADMIN'>,
      });
      router.replace('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        const entries = Object.entries(error.fieldErrors);
        for (const [field, messages] of entries) {
          if (field === 'name' || field === 'email' || field === 'password' || field === 'role') {
            setError(field, { message: messages[0] });
          }
        }
        if (entries.length === 0) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-zinc-400">Join the network of film professionals.</p>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {formError ? <Alert>{formError}</Alert> : null}

          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'name-error' : undefined}
              {...register('name')}
            />
          </Field>

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

          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint={`At least ${LIMITS.PASSWORD_MIN} characters.`}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : 'password-hint'}
              {...register('password')}
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              {...register('confirmPassword')}
            />
          </Field>

          <Field label="Professional role" htmlFor="role" error={errors.role?.message}>
            <NativeSelect
              id="role"
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'role-error' : undefined}
              {...register('role')}
            >
              {PUBLIC_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-400 underline underline-offset-4">
          Log in
        </Link>
      </p>
    </div>
  );
}
