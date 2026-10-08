export { cn } from 'cn';

/** "1.4 MB", "820 KB" — decimal units, as file pickers and Cloudinary report them. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1000 * 1000) return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

/** "2:05" from seconds. */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
