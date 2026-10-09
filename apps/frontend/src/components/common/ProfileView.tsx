import { Avatar } from './Avatar';
import { PortfolioMedia } from './PortfolioMedia';
import { Card, EmptyState } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import {
  ROLE_LABELS,
  type Experience,
  type PortfolioItem,
  type PublicProfile,
  type Skill,
} from '@/types';

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00.000Z`)
  );
}

export function SkillList({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) return <EmptyState>No skills listed yet.</EmptyState>;

  return (
    <ul className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <li
          key={skill.id}
          className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-sm text-zinc-200"
        >
          {skill.name}
        </li>
      ))}
    </ul>
  );
}

export function ExperienceList({ experiences }: { experiences: Experience[] }) {
  if (experiences.length === 0) return <EmptyState>No credits listed yet.</EmptyState>;

  return (
    <ol className="flex flex-col gap-4">
      {experiences.map((item) => (
        <li key={item.id} className="border-l-2 border-zinc-800 pl-4">
          <p className="font-medium text-zinc-100">{item.title}</p>
          <p className="text-sm text-zinc-400">{item.organization}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-zinc-500">
            {formatMonth(item.startDate)} — {item.endDate ? formatMonth(item.endDate) : 'Present'}
          </p>
          {item.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{item.description}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The shared profile presentation. It is given only the public projection, so
 * the same component renders both `/profile` and `/profile/[id]` and cannot
 * accidentally leak an owner-only field into the public page.
 */
export function ProfileView({
  profile,
  children,
}: {
  profile: PublicProfile;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar name={profile.name} photoUrl={profile.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
          <p className="text-sm text-brand-300">{ROLE_LABELS[profile.role]}</p>
          {profile.location ? (
            <p className="mt-1 text-sm text-zinc-400">{profile.location}</p>
          ) : null}
        </div>
      </div>

      {children}

      <Card>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">About</h2>
        {profile.bio ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{profile.bio}</p>
        ) : (
          <EmptyState>No bio yet.</EmptyState>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Skills</h2>
        <SkillList skills={profile.skills} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Experience
        </h2>
        <ExperienceList experiences={profile.experiences} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Portfolio
        </h2>
        <PortfolioList items={profile.portfolio} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">CV</h2>
        {profile.resume ? (
          <p className="text-sm text-zinc-200">
            <a
              href={profile.resume.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {profile.resume.fileName}
            </a>{' '}
            <span className="text-zinc-500">(PDF, {formatBytes(profile.resume.bytes)})</span>
          </p>
        ) : (
          <EmptyState>No CV uploaded yet.</EmptyState>
        )}
      </Card>
    </div>
  );
}

export function PortfolioList({ items }: { items: PortfolioItem[] }) {
  if (items.length === 0) return <EmptyState>No portfolio photos or reels yet.</EmptyState>;

  const photos = items.filter((item) => item.kind === 'PHOTO');
  const videos = items.filter((item) => item.kind === 'VIDEO');
  const links = items.filter((item) => item.kind === 'LINK');

  return (
    <div className="flex flex-col gap-5">
      {links.length > 0 ? (
        <ul aria-label="Instagram reels" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {links.map((item) => (
            <li key={item.id}>
              <PortfolioMedia item={item} />
            </li>
          ))}
        </ul>
      ) : null}
      {videos.length > 0 ? (
        <ul aria-label="Show reels" className="grid gap-3 sm:grid-cols-2">
          {videos.map((item) => (
            <li key={item.id}>
              <PortfolioMedia item={item} />
            </li>
          ))}
        </ul>
      ) : null}
      {photos.length > 0 ? (
        <ul aria-label="Portfolio photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((item) => (
            <li key={item.id}>
              <PortfolioMedia item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
