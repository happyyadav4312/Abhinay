'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, profileApi } from '@/lib/api';
import { skillFormSchema, type SkillFormValues } from '@/lib/validation';
import { Alert, Button, Card, EmptyState, Field, Input } from '@/components/ui';
import type { Skill } from '@/types';

export function SkillsSection({
  skills,
  onChange,
}: {
  skills: Skill[];
  onChange: (skills: Skill[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: { name: '' },
  });

  async function onAdd(values: SkillFormValues) {
    setError(null);
    setStatus(null);

    try {
      const { skill } = await profileApi.addSkill(values.name);

      // Adding an existing skill is idempotent server-side; reflect that here
      // instead of showing a duplicate chip.
      if (skills.some((existing) => existing.id === skill.id)) {
        setStatus(`"${skill.name}" is already on your profile.`);
      } else {
        onChange([...skills, skill].sort((a, b) => a.name.localeCompare(b.name)));
        setStatus(`Added "${skill.name}".`);
      }
      reset();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.name) {
        setFieldError('name', { message: caught.fieldErrors.name[0] });
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Could not add that skill.');
      }
    }
  }

  async function onRemove(skill: Skill) {
    setError(null);
    setStatus(null);
    setRemovingId(skill.id);

    try {
      await profileApi.removeSkill(skill.id);
      onChange(skills.filter((existing) => existing.id !== skill.id));
      setStatus(`Removed "${skill.name}".`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not remove that skill.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Skills</h2>

      {error ? <Alert>{error}</Alert> : null}
      {status ? <Alert tone="info">{status}</Alert> : null}

      {skills.length === 0 ? (
        <EmptyState>No skills yet. Add the crafts you work in.</EmptyState>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/60 py-1 pl-3 pr-1 text-sm text-zinc-200"
            >
              {skill.name}
              <button
                type="button"
                aria-label={`Remove ${skill.name}`}
                disabled={removingId === skill.id}
                onClick={() => void onRemove(skill)}
                className="grid h-6 w-6 place-items-center rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        A nested <form> is invalid HTML, so this section is a sibling of the
        scalar form rather than a child. That is also what keeps an add/remove
        from touching unsaved scalar edits.
      */}
      <form
        onSubmit={handleSubmit(onAdd)}
        noValidate
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="flex-1">
          <Field label="Add a skill" htmlFor="skill-name" error={errors.name?.message}>
            <Input
              id="skill-name"
              placeholder="e.g. Method Acting"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'skill-name-error' : undefined}
              {...register('name')}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" isLoading={isSubmitting} className="sm:mt-7">
          Add
        </Button>
      </form>
    </Card>
  );
}
