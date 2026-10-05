'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@/lib/api';
import { castingRoleFormSchema, LIMITS, type CastingRoleFormValues } from '@/lib/validation';
import { Alert, Button, Field, Input, NativeSelect, Textarea } from '@/components/ui';
import {
  PUBLIC_ROLES,
  ROLE_LABELS,
  type CastingRole,
  type CastingRoleInput,
  type PublicRole,
} from '@/types';

export const BLANK_CASTING_ROLE: CastingRoleFormValues = {
  title: '',
  seekingRole: 'ACTOR',
  location: '',
  compensation: '',
  description: '',
  requirements: '',
};

/** Seed the form from a saved role, for editing. */
export function castingRoleToFormValues(role: CastingRole): CastingRoleFormValues {
  return {
    title: role.title,
    seekingRole: role.seekingRole,
    location: role.location,
    compensation: role.compensation,
    description: role.description,
    requirements: role.requirements,
  };
}

const FIELD_NAMES = [
  'title',
  'seekingRole',
  'location',
  'compensation',
  'description',
  'requirements',
] as const;
type FieldName = (typeof FIELD_NAMES)[number];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

export interface CastingFormAction {
  intent: string;
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'secondary';
}

interface CastingRoleFormProps {
  defaultValues: CastingRoleFormValues;
  /** Buttons in visual order. */
  actions: CastingFormAction[];
  /** The intent used when the form is submitted with Enter — keep it the safest one. */
  defaultIntent: string;
  /** Throw an ApiError to have its field errors attached to the matching controls. */
  onSubmit: (input: CastingRoleInput, intent: string) => Promise<void>;
  onCancel: () => void;
  ariaLabel: string;
}

/**
 * The create and edit form for a casting role. Client validation mirrors the
 * server for fast feedback; the server remains the authority, and its field
 * errors are mapped back onto the same controls.
 */
export function CastingRoleForm({
  defaultValues,
  actions,
  defaultIntent,
  onSubmit,
  onCancel,
  ariaLabel,
}: CastingRoleFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CastingRoleFormValues>({
    resolver: zodResolver(castingRoleFormSchema),
    defaultValues,
  });

  function submitWith(intent: string) {
    return handleSubmit(async (values) => {
      setFormError(null);
      setPendingIntent(intent);

      try {
        await onSubmit({ ...values, seekingRole: values.seekingRole as PublicRole }, intent);
      } catch (caught) {
        if (caught instanceof ApiError) {
          let attached = false;
          for (const [field, messages] of Object.entries(caught.fieldErrors)) {
            if (isFieldName(field)) {
              setError(field, { message: messages[0] });
              attached = true;
            }
          }
          if (!attached) setFormError(caught.message);
        } else {
          setFormError('Something went wrong. Please try again.');
        }
      } finally {
        setPendingIntent(null);
      }
    });
  }

  const describedBy = (field: FieldName, id: string) =>
    errors[field] ? `${id}-error` : `${id}-hint`;

  return (
    <form
      onSubmit={submitWith(defaultIntent)}
      noValidate
      aria-label={ariaLabel}
      className="flex flex-col gap-4"
    >
      {formError ? <Alert>{formError}</Alert> : null}

      <Field
        label="Title"
        htmlFor="casting-title"
        error={errors.title?.message}
        hint="The part or position, e.g. “Lead — Meera, investigative journalist”."
      >
        <Input
          id="casting-title"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy('title', 'casting-title')}
          {...register('title')}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Casting for"
          htmlFor="casting-seeking-role"
          error={errors.seekingRole?.message}
          hint="The profession you are looking for."
        >
          {/* h-8 matches the Input beside it (the shared select is h-9); py-0 avoids clipping. */}
          <NativeSelect
            id="casting-seeking-role"
            className="h-8 py-0"
            aria-invalid={Boolean(errors.seekingRole)}
            aria-describedby={describedBy('seekingRole', 'casting-seeking-role')}
            {...register('seekingRole')}
          >
            {PUBLIC_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="Location"
          htmlFor="casting-location"
          error={errors.location?.message}
          hint="City or region, or “Remote”."
        >
          <Input
            id="casting-location"
            aria-invalid={Boolean(errors.location)}
            aria-describedby={describedBy('location', 'casting-location')}
            {...register('location')}
          />
        </Field>
      </div>

      <Field
        label="Compensation"
        htmlFor="casting-compensation"
        error={errors.compensation?.message}
        hint="Rate and terms, e.g. “₹15,000 per shooting day” or “Unpaid — credit and meals”."
      >
        <Input
          id="casting-compensation"
          aria-invalid={Boolean(errors.compensation)}
          aria-describedby={describedBy('compensation', 'casting-compensation')}
          {...register('compensation')}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="casting-description"
        error={errors.description?.message}
        hint={`The project and the part. Up to ${LIMITS.CASTING_DESCRIPTION_MAX} characters.`}
      >
        <Textarea
          id="casting-description"
          rows={6}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={describedBy('description', 'casting-description')}
          {...register('description')}
        />
      </Field>

      <Field
        label="Requirements"
        htmlFor="casting-requirements"
        error={errors.requirements?.message}
        hint="Who you are looking for: age range, languages, skills, availability."
      >
        <Textarea
          id="casting-requirements"
          rows={4}
          aria-invalid={Boolean(errors.requirements)}
          aria-describedby={describedBy('requirements', 'casting-requirements')}
          {...register('requirements')}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isDefault = action.intent === defaultIntent;
          return (
            <Button
              key={action.intent}
              type={isDefault ? 'submit' : 'button'}
              variant={action.variant ?? 'default'}
              onClick={isDefault ? undefined : submitWith(action.intent)}
              isLoading={pendingIntent === action.intent}
              disabled={pendingIntent !== null}
            >
              {pendingIntent === action.intent ? action.pendingLabel : action.label}
            </Button>
          );
        })}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pendingIntent !== null}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
