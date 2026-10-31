'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface VideoUploadProps {
  onUpload: (file: File, note?: string) => Promise<void>;
  disabled?: boolean;
}

export function VideoUpload({ onUpload, disabled }: VideoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (e.g. 100MB max)
    if (file.size > 100 * 1024 * 1024) {
      setError('File size must not exceed 100MB');
      return;
    }

    // Check mime type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      setError('Please choose a valid MP4, MOV, or WebM video');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);
    setError(null);

    try {
      await onUpload(selectedFile, note);
      handleClear();
      setNote('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300">
        Submit Self-Tape Video
      </h3>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {!selectedFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-800 hover:border-amber-500/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-stone-950/40"
        >
          <div className="h-12 w-12 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center mb-3 text-amber-500">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-stone-200">
            Click to upload your audition tape
          </p>
          <p className="text-xs text-stone-400 mt-1">
            MP4, MOV, or WebM up to 100MB (max 5 minutes)
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            Large videos can take a few minutes to upload and process.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black border border-stone-800 aspect-video max-h-72 flex items-center justify-center">
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                className="w-full h-full object-contain"
              />
            )}
            <button
              type="button"
              onClick={handleClear}
              disabled={isUploading}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-stone-900/80 text-stone-300 hover:text-white transition-colors"
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-stone-400">
            <Video className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="font-medium text-stone-200 truncate">
              {selectedFile.name}
            </span>
            <span>({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Add a note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="E.g., Take 1 - Scene 3 dramatic monologue, or slating information..."
              disabled={isUploading || disabled}
              rows={2}
              className="w-full rounded-xl bg-stone-950 border border-stone-800 px-3.5 py-2 text-sm text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={isUploading || disabled}
              className="border-stone-800 text-stone-300"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isUploading || disabled}
              className="bg-amber-600 hover:bg-amber-500 text-white min-w-[120px]"
            >
              {isUploading ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  <span>Uploading and processing...</span>
                </>
              ) : (
                'Submit Tape'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
