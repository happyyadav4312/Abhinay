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
      <h2 className="font-heading text-lg font-medium text-foreground mb-1">
        Curriculum Vitae
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Anyone who views your profile can open your CV, so leave out contact details you do not want
        to share publicly.
      </p>

      {resume ? (
        <p className="mb-4 text-sm text-foreground">
          Current CV:{' '}
          <a
            href={resume.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {resume.fileName}
          </a>{' '}
          <span className="text-muted-foreground tabular-nums">({formatBytes(resume.bytes)})</span>
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">No CV uploaded yet.</p>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="resume" className="text-sm font-medium text-foreground">
            {resume ? 'Replace with a new PDF' : 'Choose a PDF'}
          </label>
          <input
            ref={inputRef}
            id="resume"
            type="file"
            accept="application/pdf"
            disabled={busy !== null}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 transition-colors"
          />
          <p className="mt-1 text-xs text-muted-foreground">PDF only, up to {POLICY.label}.</p>
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
