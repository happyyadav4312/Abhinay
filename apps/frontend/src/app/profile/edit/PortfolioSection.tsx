'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, profileApi } from '@/lib/api';
import {
  LIMITS,
  MEDIA_LIMITS,
  portfolioLinkFormSchema,
  portfolioTitleSchema,
  type PortfolioLinkFormValues,
} from '@/lib/validation';
import { formatBytes } from '@/lib/utils';
import { PortfolioMedia } from '@/components/common';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import type { PortfolioItem, PortfolioMediaKind } from '@/types';

const COPY: Record<
  PortfolioMediaKind,
  {
    title: string;
    field: string;
    noun: string;
    submit: string;
    max: number;
    accept: string;
    help: string;
  }
> = {
  PHOTO: {
    title: 'Portfolio photos',
    field: 'portfolio-photo',
    noun: 'photo',
    // Distinct from the profile photo's "Upload photo" button on the same page.
    submit: 'Add to portfolio',
    max: LIMITS.PORTFOLIO_PHOTOS_MAX,
    accept: MEDIA_LIMITS.PORTFOLIO_PHOTO.types.join(','),
    help: `JPEG, PNG or WebP, up to ${MEDIA_LIMITS.PORTFOLIO_PHOTO.label}. Location data is removed.`,
  },
  VIDEO: {
    title: 'Show reels',
    field: 'portfolio-video',
    noun: 'reel',
    submit: 'Add reel',
    max: LIMITS.PORTFOLIO_VIDEOS_MAX,
    accept: MEDIA_LIMITS.REEL.types.join(','),
    help: `MP4, MOV or WebM, up to ${MEDIA_LIMITS.REEL.label} and ${MEDIA_LIMITS.REEL.maxMinutes} minutes. Large videos can take a minute to upload.`,
  },
  LINK: {
    title: 'Instagram reels',
    field: 'portfolio-link',
    noun: 'Instagram link',
    submit: 'Add Instagram reel',
    max: LIMITS.PORTFOLIO_LINKS_MAX,
    accept: '',
    help: 'Paste the link from Instagram’s Share → Copy link. Visitors open it on Instagram.',
  },
};

function policyFor(kind: PortfolioMediaKind) {
  return kind === 'PHOTO' ? MEDIA_LIMITS.PORTFOLIO_PHOTO : MEDIA_LIMITS.REEL;
}

/** Add an Instagram reel link, with an optional caption. Nothing is uploaded. */
function LinkAdder({ onAdded }: { onAdded: (item: PortfolioItem) => void }) {
  const copy = COPY.LINK;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PortfolioLinkFormValues>({
    resolver: zodResolver(portfolioLinkFormSchema),
    defaultValues: { url: '', title: '' },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          const { item } = await profileApi.addPortfolioLink(values.url, values.title);
          onAdded(item);
          reset({ url: '', title: '' });
        } catch (caught) {
          if (caught instanceof ApiError && (caught.fieldErrors.url || caught.fieldErrors.title)) {
            if (caught.fieldErrors.url) setError('url', { message: caught.fieldErrors.url[0] });
            if (caught.fieldErrors.title)
              setError('title', { message: caught.fieldErrors.title[0] });
          } else {
            setFormError(
              caught instanceof ApiError ? caught.message : 'Could not add the link. Try again.'
            );
          }
        }
      })}
    >
      <Field
        label="Instagram reel link"
        htmlFor={`${copy.field}-url`}
        error={errors.url?.message}
        hint={copy.help}
      >
        <Input
          id={`${copy.field}-url`}
          type="url"
          inputMode="url"
          placeholder="https://www.instagram.com/reel/…"
          aria-invalid={Boolean(errors.url)}
          {...register('url')}
        />
      </Field>
      <Field
        label="Reel caption (optional)"
        htmlFor={`${copy.field}-title`}
        error={errors.title?.message}
      >
        <Input
          id={`${copy.field}-title`}
          placeholder="e.g. Monologue — Kochi, 2026"
          aria-invalid={Boolean(errors.title)}
          {...register('title')}
        />
      </Field>
      {formError ? <Alert>{formError}</Alert> : null}
      <div>
        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? 'Adding…' : copy.submit}
        </Button>
      </div>
    </form>
  );
}

/** Add a photo or reel, with an optional caption. */
function Uploader({
  kind,
  onAdded,
}: {
  kind: PortfolioMediaKind;
  onAdded: (item: PortfolioItem) => void;
}) {
  const copy = COPY[kind];
  const policy = policyFor(kind);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(selected: File | null) {
    setError(null);
    setFile(null);
    if (!selected) return;
    if (!(policy.types as readonly string[]).includes(selected.type)) {
      setError(
        kind === 'PHOTO' ? 'Choose a JPEG, PNG or WebP image.' : 'Choose an MP4, MOV or WebM video.'
      );
      return;
    }
    if (selected.size > policy.maxBytes) {
      setError(`That file is larger than ${policy.label}.`);
      return;
    }
    setFile(selected);
  }

  async function upload() {
    if (!file) return;
    const parsed = portfolioTitleSchema.safeParse(title);
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message ?? 'Invalid title');
      return;
    }
    setTitleError(null);
    setBusy(true);
    setError(null);
    try {
      const { item } = await profileApi.addPortfolioItem(kind, file, parsed.data);
      onAdded(item);
      setFile(null);
      setTitle('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.title) {
        setTitleError(caught.fieldErrors.title[0]);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Upload failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3">
      <div>
        <label htmlFor={copy.field} className="text-sm font-medium text-zinc-200">
          Add a {copy.noun}
        </label>
        <input
          ref={inputRef}
          id={copy.field}
          type="file"
          accept={copy.accept}
          disabled={busy}
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
        />
        <p className="mt-1 text-xs text-zinc-500">{copy.help}</p>
      </div>

      {file ? (
        <Field
          label="Caption (optional)"
          htmlFor={`${copy.field}-title`}
          error={titleError ?? undefined}
        >
          <Input
            id={`${copy.field}-title`}
            value={title}
            disabled={busy}
            aria-invalid={Boolean(titleError)}
            placeholder={kind === 'PHOTO' ? 'e.g. On set — Kochi, 2026' : 'e.g. Drama reel 2026'}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!file || busy}
          isLoading={busy}
          onClick={() => void upload()}
        >
          {busy ? 'Uploading…' : copy.submit}
        </Button>
        {file && !busy ? (
          <span className="self-center text-xs text-zinc-500">
            {file.name} · {formatBytes(file.size)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KindBlock({
  kind,
  items,
  onAdded,
  onRemoved,
}: {
  kind: PortfolioMediaKind;
  items: PortfolioItem[];
  onAdded: (item: PortfolioItem) => void;
  onRemoved: (id: string) => void;
}) {
  const copy = COPY[kind];
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoving(id);
    setError(null);
    try {
      await profileApi.deletePortfolioItem(id);
      onRemoved(id);
      setConfirming(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        // Already gone (another tab): reflect that rather than erroring.
        onRemoved(id);
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'Could not remove it. Try again.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-labelledby={`${copy.field}-heading`} className="flex flex-col gap-3">
      <h3 id={`${copy.field}-heading`} className="text-sm font-medium text-zinc-200">
        {copy.title}{' '}
        <span className="font-normal text-zinc-500">
          ({items.length} of {copy.max})
        </span>
      </h3>

      {error ? <Alert>{error}</Alert> : null}

      {items.length > 0 ? (
        <ul
          className={
            kind === 'PHOTO' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'grid gap-3 sm:grid-cols-2'
          }
        >
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2">
              <PortfolioMedia item={item} />
              {confirming === item.id ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    isLoading={removing === item.id}
                    onClick={() => void remove(item.id)}
                  >
                    Yes, remove
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removing !== null}
                    onClick={() => setConfirming(null)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Remove ${item.title ?? `this ${copy.noun}`}`}
                  onClick={() => setConfirming(item.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length < copy.max ? (
        kind === 'LINK' ? (
          <LinkAdder onAdded={onAdded} />
        ) : (
          <Uploader kind={kind} onAdded={onAdded} />
        )
      ) : (
        <p className="text-sm text-zinc-500">
          You have reached the limit of {copy.max} {copy.noun}s. Remove one to add another.
        </p>
      )}
    </section>
  );
}

/** Portfolio photos, show reels and Instagram reel links (WBS 1.1.2.3). */
export function PortfolioSection({
  items,
  onChange,
}: {
  items: PortfolioItem[];
  onChange: (items: PortfolioItem[]) => void;
}) {
  const photos = items.filter((item) => item.kind === 'PHOTO');
  const videos = items.filter((item) => item.kind === 'VIDEO');
  const links = items.filter((item) => item.kind === 'LINK');
  const add = (item: PortfolioItem) => onChange([...items, item]);
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));

  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Portfolio</h2>
      <div className="flex flex-col gap-6">
        <KindBlock kind="PHOTO" items={photos} onAdded={add} onRemoved={remove} />
        <KindBlock kind="VIDEO" items={videos} onAdded={add} onRemoved={remove} />
        <KindBlock kind="LINK" items={links} onAdded={add} onRemoved={remove} />
      </div>
    </Card>
  );
}
