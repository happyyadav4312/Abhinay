'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, profileApi } from '@/lib/api';
import { LIMITS, profileFormSchema, type ProfileFormValues } from '@/lib/validation';
import { RequireAuth } from '@/components/common';
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from '@/components/ui';
import {
  ROLE_LABELS,
  type Experience,
  type OwnProfile,
  type PortfolioItem,
  type Resume,
  type Skill,
} from '@/types';
import { PhotoSection } from './PhotoSection';
import { PortfolioSection } from './PortfolioSection';
import { ResumeSection } from './ResumeSection';
import { SkillsSection } from './SkillsSection';
import { ExperienceSection } from './ExperienceSection';

function EditProfileContent() {
  const { user, applyUser } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    // `raw: true` keeps the handler's values as the strings the inputs hold.
    // Without it the resolver hands back the schema's *output*, where a blank
    // optional field has already become null, and the parse below would reject
    // its own previous result.
    resolver: zodResolver(profileFormSchema, undefined, { raw: true }),
    defaultValues: { name: '', bio: '', location: '', phone: '' },
  });

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body. `reloadToken` re-runs the effect for the retry button.
  useEffect(() => {
    const controller = new AbortController();

    profileApi
      .me(controller.signal)
      .then(({ profile: loaded }) => {
        if (controller.signal.aborted) return;
        setLoadError(null);
        setProfile(loaded);
        setSkills(loaded.skills);
        setExperiences(loaded.experiences);
        setPhotoUrl(loaded.photoUrl);
        setResume(loaded.resume);
        setPortfolio(loaded.portfolio);
        reset({
          name: loaded.name,
          bio: loaded.bio ?? '',
          location: loaded.location ?? '',
          phone: loaded.phone ?? '',
        });
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(caught instanceof ApiError ? caught.message : 'Could not load your profile.');
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken, reset]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * Skills, experience and photo each own their slice of state. A successful
   * sub-operation updates only that slice and never calls `reset()`, so unsaved
   * text in the scalar form below survives untouched.
   */
  function applySubOperation(updated: OwnProfile) {
    setProfile(updated);
    setPhotoUrl(updated.photoUrl);
    setSkills(updated.skills);
    setExperiences(updated.experiences);
    setResume(updated.resume);
    setPortfolio(updated.portfolio);
  }

  async function onSave(values: ProfileFormValues) {
    setSaveError(null);
    setSaved(false);

    try {
      const parsed = profileFormSchema.parse(values);
      const { profile: updated } = await profileApi.update(parsed);

      setProfile(updated);
      // Re-seed the form from the server's answer so `isDirty` resets and the
      // displayed values are exactly what was persisted.
      reset({
        name: updated.name,
        bio: updated.bio ?? '',
        location: updated.location ?? '',
        phone: updated.phone ?? '',
      });

      // Keep the header, dashboard and profile in agreement after a rename.
      if (user) applyUser({ ...user, name: updated.name });

      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const entries = Object.entries(caught.fieldErrors);
        for (const [field, messages] of entries) {
          if (field === 'name' || field === 'bio' || field === 'location' || field === 'phone') {
            setError(field, { message: messages[0] });
          }
        }
        if (entries.length === 0) setSaveError(caught.message);
      } else {
        setSaveError('Could not save your profile. Please try again.');
      }
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-6 w-6 text-brand-400" />
        <span className="sr-only">Loading your profile…</span>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert>{loadError ?? 'Profile unavailable.'}</Alert>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Changes are saved to your account as soon as each section is submitted.
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          Back to profile
        </Link>
      </div>

      <PhotoSection name={profile.name} photoUrl={photoUrl} onUpdated={applySubOperation} />

      <Card>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Basic details
        </h2>

        <form onSubmit={handleSubmit(onSave)} noValidate className="flex flex-col gap-4">
          {saveError ? <Alert>{saveError}</Alert> : null}
          {saved && !isDirty ? <Alert tone="success">Profile saved.</Alert> : null}

          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" aria-invalid={Boolean(errors.name)} {...register('name')} />
          </Field>

          {/* Read-only by design: neither is editable in this release. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email-readonly">
              <Input id="email-readonly" value={profile.email} readOnly disabled />
            </Field>
            <Field label="Professional role" htmlFor="role-readonly">
              <Input id="role-readonly" value={ROLE_LABELS[profile.role]} readOnly disabled />
            </Field>
          </div>

          <Field
            label="Bio"
            htmlFor="bio"
            error={errors.bio?.message}
            hint={`Up to ${LIMITS.BIO_MAX} characters.`}
          >
            <Textarea id="bio" rows={5} aria-invalid={Boolean(errors.bio)} {...register('bio')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" htmlFor="location" error={errors.location?.message}>
              <Input
                id="location"
                placeholder="e.g. Mumbai, India"
                aria-invalid={Boolean(errors.location)}
                {...register('location')}
              />
            </Field>
            <Field
              label="Phone"
              htmlFor="phone"
              error={errors.phone?.message}
              hint="Optional. Never shown publicly."
            >
              <Input
                id="phone"
                type="tel"
                aria-invalid={Boolean(errors.phone)}
                {...register('phone')}
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button type="submit" isLoading={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save details'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => router.push('/profile')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      <SkillsSection skills={skills} onChange={setSkills} />
      <ExperienceSection experiences={experiences} onChange={setExperiences} />
      <PortfolioSection items={portfolio} onChange={setPortfolio} />
      <ResumeSection resume={resume} onUpdated={applySubOperation} />
    </div>
  );
}

export default function EditProfilePage() {
  return (
    <RequireAuth>
      <EditProfileContent />
    </RequireAuth>
  );
}
