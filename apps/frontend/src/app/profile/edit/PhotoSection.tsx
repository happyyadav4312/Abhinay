'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, profileApi } from '@/lib/api';
import { Avatar } from '@/components/common';
import { Alert, Button, Card } from '@/components/ui';
import type { OwnProfile } from '@/types';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function PhotoSection({
  name,
  photoUrl,
  onUpdated,
}: {
  name: string;
  photoUrl: string | null;
  onUpdated: (profile: OwnProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** File and its preview URL move together so the blob is never orphaned. */
  const [selection, setSelection] = useState<{ file: File; previewUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const file = selection?.file ?? null;
  const previewUrl = selection?.previewUrl ?? null;

  // Cleanup only — no state is set here. The cleanup runs both when the preview
  // is replaced and when the section unmounts, so no blob URL is ever leaked.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function pick(selected: File | null) {
    setError(null);
    setStatus(null);

    if (!selected) {
      setSelection(null);
      return;
    }
    // Mirrors the server policy so obvious mistakes fail instantly; the server
    // still decodes and re-encodes every accepted upload.
    if (!ACCEPTED.includes(selected.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      setSelection(null);
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError('That image is larger than 5 MB.');
      setSelection(null);
      return;
    }
    setSelection({ file: selected, previewUrl: URL.createObjectURL(selected) });
  }

  function reset() {
    setSelection(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function run(action: () => Promise<{ profile: OwnProfile }>, successMessage: string) {
    setIsBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { profile } = await action();
      onUpdated(profile);
      setStatus(successMessage);
      reset();
    } catch (caught) {
      // The previously saved photo is untouched by a failed upload.
      setError(
        caught instanceof ApiError ? caught.message : 'Could not update your photo. Try again.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Profile photo
      </h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={name} photoUrl={previewUrl ?? photoUrl} size="lg" />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <label htmlFor="photo" className="text-sm font-medium text-zinc-200">
              Choose an image
            </label>
            <input
              ref={inputRef}
              id="photo"
              type="file"
              accept={ACCEPTED.join(',')}
              disabled={isBusy}
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
            />
            <p className="mt-1 text-xs text-zinc-500">
              JPEG, PNG or WebP, up to 5 MB. Cropped to a 512×512 square.
            </p>
          </div>

          {error ? <Alert>{error}</Alert> : null}
          {status ? <Alert tone="success">{status}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!file}
              isLoading={isBusy && Boolean(file)}
              onClick={() => file && void run(() => profileApi.uploadPhoto(file), 'Photo updated.')}
            >
              {isBusy && file ? 'Uploading…' : 'Upload photo'}
            </Button>

            {file ? (
              <Button type="button" variant="ghost" disabled={isBusy} onClick={reset}>
                Cancel
              </Button>
            ) : null}

            {photoUrl && !file ? (
              <Button
                type="button"
                variant="destructive"
                isLoading={isBusy}
                onClick={() => void run(() => profileApi.removePhoto(), 'Photo removed.')}
              >
                Remove photo
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
