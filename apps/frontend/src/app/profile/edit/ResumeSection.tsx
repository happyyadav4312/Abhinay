'use client';

import { useRef, useState } from 'react';
import { ApiError, profileApi } from '@/lib/api';
import { MEDIA_LIMITS } from '@/lib/validation';
import { formatBytes } from '@/lib/utils';
import { Alert, Button, Card } from '@/components/ui';
import type { OwnProfile, Resume } from '@/types';

const POLICY = MEDIA_LIMITS.RESUME;

/**
 * The CV: one PDF, replaced by the next upload. The file goes to media storage
 * (Cloudinary); the profile keeps only its link.
 */
export function ResumeSection({
  resume,
  onUpdated,
}: {
  resume: Resume | null;
  onUpdated: (profile: OwnProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  function pick(selected: File | null) {
    setError(null);
    setStatus(null);
    setFile(null);
    if (!selected) return;
    // Mirrors the server policy so obvious mistakes fail instantly; the server
    // still checks the file's signature.
    if (!(POLICY.types as readonly string[]).includes(selected.type)) {
      setError('Choose a PDF file.');
      return;
    }
    if (selected.size > POLICY.maxBytes) {
      setError(`That file is larger than ${POLICY.label}.`);
      return;
    }
    setFile(selected);
  }

  function reset() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function run(
    kind: 'upload' | 'remove',
    action: () => Promise<{ profile: OwnProfile }>,
    done: string
  ) {
    setBusy(kind);
    setError(null);
    setStatus(null);
    try {
      const { profile } = await action();
      onUpdated(profile);
      setStatus(done);
      reset();
    } catch (caught) {
      // A failed upload never touches the CV already saved.
      setError(
        caught instanceof ApiError ? caught.message : 'Could not update your CV. Try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-zinc-500">
        CV / résumé
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        Anyone who views your profile can open your CV, so leave out contact details you do not want
        to share publicly.
      </p>

      {resume ? (
        <p className="mb-4 text-sm text-zinc-200">
          Current CV:{' '}
          <a
            href={resume.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {resume.fileName}
          </a>{' '}
          <span className="text-zinc-500">({formatBytes(resume.bytes)})</span>
        </p>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">No CV uploaded yet.</p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="resume" className="text-sm font-medium text-zinc-200">
            {resume ? 'Replace with a new PDF' : 'Choose a PDF'}
          </label>
          <input
            ref={inputRef}
            id="resume"
            type="file"
            accept="application/pdf"
            disabled={busy !== null}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
          />
          <p className="mt-1 text-xs text-zinc-500">PDF only, up to {POLICY.label}.</p>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        {status ? <Alert tone="success">{status}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!file || busy !== null}
            isLoading={busy === 'upload'}
            onClick={() =>
              file && void run('upload', () => profileApi.uploadResume(file), 'CV uploaded.')
            }
          >
            {busy === 'upload' ? 'Uploading…' : 'Upload CV'}
          </Button>
          {file ? (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={reset}>
              Cancel
            </Button>
          ) : null}
          {resume && !file ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy !== null}
              isLoading={busy === 'remove'}
              onClick={() => void run('remove', () => profileApi.removeResume(), 'CV removed.')}
            >
              Remove CV
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
