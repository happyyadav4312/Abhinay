import { Avatar } from './Avatar';
import { Card, EmptyState } from '@/components/ui';
import { ROLE_LABELS, type Experience, type PublicProfile, type Skill } from '@/types';

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
    </div>
  );
}
