'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, profileApi } from '@/lib/api';
import { experienceFormSchema, type ExperienceFormValues } from '@/lib/validation';
import { Alert, Button, Card, EmptyState, Field, Input, Textarea } from '@/components/ui';
import type { Experience } from '@/types';

const BLANK: ExperienceFormValues = {
  title: '',
  organization: '',
  description: '',
  startDate: '',
  endDate: '',
};

function sortByStartDesc(entries: Experience[]): Experience[] {
  // Matches the server's ordering so the list does not jump after a save.
  return [...entries].sort((a, b) =>
    a.startDate === b.startDate ? a.id.localeCompare(b.id) : b.startDate.localeCompare(a.startDate)
  );
}

function formatRange(entry: Experience): string {
  const month = (value: string) =>
    new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(
      new Date(`${value}T00:00:00.000Z`)
    );
  return `${month(entry.startDate)} — ${entry.endDate ? month(entry.endDate) : 'Present'}`;
}

export function ExperienceSection({
  experiences,
  onChange,
}: {
  experiences: Experience[];
  onChange: (experiences: Experience[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<ExperienceFormValues>({
    // See the note in the edit page: raw values keep `description` a string
    // here, which is what the payload construction below assumes.
    resolver: zodResolver(experienceFormSchema, undefined, { raw: true }),
    defaultValues: BLANK,
  });

  function openCreate() {
    setError(null);
    setEditingId(null);
    reset(BLANK);
    setIsFormOpen(true);
  }

  function openEdit(entry: Experience) {
    setError(null);
    setEditingId(entry.id);
    reset({
      title: entry.title,
      organization: entry.organization,
      description: entry.description ?? '',
      startDate: entry.startDate,
      endDate: entry.endDate ?? '',
    });
    setIsFormOpen(true);
  }

  function close() {
    setIsFormOpen(false);
    setEditingId(null);
    setError(null);
    reset(BLANK);
  }

  async function onSubmit(values: ExperienceFormValues) {
    setError(null);

    const payload = {
      title: values.title.trim(),
      organization: values.organization.trim(),
      description: values.description.trim() === '' ? null : values.description.trim(),
      startDate: values.startDate,
      // An empty end date means the engagement is ongoing.
      endDate: values.endDate === '' ? null : values.endDate,
    };

    try {
      if (editingId) {
        const { experience } = await profileApi.updateExperience(editingId, payload);
        onChange(
          sortByStartDesc(experiences.map((e) => (e.id === experience.id ? experience : e)))
        );
      } else {
        const { experience } = await profileApi.createExperience(payload);
        onChange(sortByStartDesc([...experiences, experience]));
      }
      close();
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        for (const [field, messages] of Object.entries(caught.fieldErrors)) {
          if (field in BLANK) {
            setFieldError(field as keyof ExperienceFormValues, { message: messages[0] });
          }
        }
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Could not save this credit.');
      }
    }
  }

  async function onDelete(entry: Experience) {
    setError(null);
    setDeletingId(entry.id);
    try {
      await profileApi.deleteExperience(entry.id);
      onChange(experiences.filter((e) => e.id !== entry.id));
      if (editingId === entry.id) close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete this credit.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Experience</h2>
        {!isFormOpen ? (
          <Button type="button" variant="secondary" onClick={openCreate}>
            Add credit
          </Button>
        ) : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {experiences.length === 0 && !isFormOpen ? (
        <EmptyState>No credits yet. Add your first production.</EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {experiences.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-zinc-800 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-100">{entry.title}</p>
                <p className="text-sm text-zinc-400">{entry.organization}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-zinc-500">
                  {formatRange(entry)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" onClick={() => openEdit(entry)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  isLoading={deletingId === entry.id}
                  onClick={() => void onDelete(entry)}
                  className="text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {isFormOpen ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          aria-label={editingId ? 'Edit credit' : 'New credit'}
          className="mt-4 flex flex-col gap-4 rounded-md border border-zinc-800 bg-zinc-950/40 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">
            {editingId ? 'Edit credit' : 'New credit'}
          </p>

          <Field label="Title" htmlFor="exp-title" error={errors.title?.message}>
            <Input
              id="exp-title"
              placeholder="e.g. Lead Actor"
              aria-invalid={Boolean(errors.title)}
              {...register('title')}
            />
          </Field>

          <Field
            label="Production or organization"
            htmlFor="exp-organization"
            error={errors.organization?.message}
          >
            <Input
              id="exp-organization"
              placeholder="e.g. Monsoon Pictures"
              aria-invalid={Boolean(errors.organization)}
              {...register('organization')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="exp-start" error={errors.startDate?.message}>
              <Input
                id="exp-start"
                type="date"
                aria-invalid={Boolean(errors.startDate)}
                {...register('startDate')}
              />
            </Field>
            <Field
              label="End date"
              htmlFor="exp-end"
              error={errors.endDate?.message}
              hint="Leave empty if this is ongoing."
            >
              <Input
                id="exp-end"
                type="date"
                aria-invalid={Boolean(errors.endDate)}
                {...register('endDate')}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="exp-description" error={errors.description?.message}>
            <Textarea id="exp-description" rows={3} {...register('description')} />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" isLoading={isSubmitting}>
              {editingId ? 'Save credit' : 'Add credit'}
            </Button>
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
