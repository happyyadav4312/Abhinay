import {
  CastingRoleStatus,
  PortfolioMediaKind,
  PrismaClient,
  Role,
  StorageProvider,
} from '@prisma/client';
import type { StoredFileRef } from '../src/config/storage';
import { addDays, today } from '../src/utils/calendar';
import { hashPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from '../src/utils/password';
import { normalizeSkillName } from '../src/validators/profile.validator';
import { normalizeFolderName } from '../src/validators/shortlist.validator';

/**
 * Demo data for manual testing: `npm run db:seed:demo` (add `-- --fresh` to
 * recreate it).
 *
 * - 17 fictional members across every public profession, all with emails at
 *   DEMO_EMAIL_DOMAIN and one shared password (SEED_DEMO_PASSWORD, default
 *   `demo1234`).
 * - Avatars and portfolio photos are Unsplash images, linked directly
 *   (provider EXTERNAL) — nothing is uploaded to Cloudinary.
 * - Portfolio "Instagram reel" links point at real public reels from celebrity
 *   accounts, captioned with the source handle so they are never mistaken for
 *   the fictional member's own work. Every link was checked to resolve when it
 *   was added here (2026-10-09).
 * - Ten casting roles in every state (open, closing soon, no deadline, past
 *   deadline, draft, closed), applications that respect the real rules
 *   (matching profession, never the author, only while open), and shortlist
 *   folders on three roles.
 *
 * Safety: refuses NODE_ENV=production; never touches an account outside
 * DEMO_EMAIL_DOMAIN; does nothing if demo data already exists unless `--fresh`
 * is given, which deletes only the demo accounts (and everything they own).
 */

export const DEMO_EMAIL_DOMAIN = 'demo.abhinay.test';
const DEFAULT_DEMO_PASSWORD = 'demo1234';

// ── Media ───────────────────────────────────────────────

/** Unsplash photo ids, each checked to return 200 from images.unsplash.com. */
const PORTRAIT = {
  smilingWomanRed: 'photo-1494790108377-be9c29b29330',
  smilingManWhiteTee: 'photo-1507003211169-0a1dd7228f2d',
  manGreySweater: 'photo-1500648767791-00dcc994a43e',
  womanBobByLake: 'photo-1438761681033-6461ffad8d80',
  olderManGlasses: 'photo-1472099645785-5658abf4ff4e',
  womanBlueBackdrop: 'photo-1534528741775-53994a69daeb',
  manKnitSweater: 'photo-1506794778202-cad84cf45f1d',
  womanStripedTop: 'photo-1544005313-94ddf0286df2',
  curlyManHat: 'photo-1539571696357-5a69c17a67c6',
  womanDarkStudio: 'photo-1524504388940-b1c1722653e1',
  womanDenimJacket: 'photo-1488426862026-3ee34a7d66df',
  beardedManProfile: 'photo-1522075469751-3a6694fb2f61',
  manInSuit: 'photo-1519085360753-af0119f7cbe7',
  womanBlazerOffice: 'photo-1573496359142-b8d87734a5a2',
  womanHairBun: 'photo-1580489944761-15a19d654956',
  manGlassesBeard: 'photo-1599566150163-29194dcaad36',
} as const;

const FILM = {
  clapperboardDesert: 'photo-1485846234645-a62644f84728',
  projectorBeam: 'photo-1478720568477-152d9b164e26',
  emptyCinemaAisle: 'photo-1489599849927-2ee91cede3ba',
  neonCinemaFront: 'photo-1536440136628-849c177e76a1',
  filmReels: 'photo-1440404653325-ab127d49abc1',
  audienceInHall: 'photo-1517604931442-7e0c8ed2963c',
  cameraAndLens: 'photo-1502982720700-bfff97f2ecac',
  mirrorlessKit: 'photo-1516035069371-29a1b244cc32',
  editingTimeline: 'photo-1574717024653-61fd2cf4d44d',
  eyeBehindClapper: 'photo-1585951237318-9ea5e175b891',
  theatreStage: 'photo-1507924538820-ede94a04019d',
  stageSilhouettes: 'photo-1503095396549-807759245b35',
  studioMicrophone: 'photo-1516280440614-37939bbacd81',
  redSeatsDim: 'photo-1524712245354-2c4e5e7121c0',
  actressWithClapper: 'photo-1594909122845-11baa439b7bf',
} as const;

function avatarUrl(id: string): string {
  return `https://images.unsplash.com/${id}?w=512&h=512&fit=crop&crop=faces&auto=format&q=80`;
}

function photoUrl(id: string): string {
  return `https://images.unsplash.com/${id}?w=1200&auto=format&q=80`;
}

/** Public reels, verified live on 2026-10-09 (their og:url names the owner). */
const REELS = [
  { code: 'CZ9VsSUBomM', owner: 'madhuridixitnene' },
  { code: 'CZ6vPjjhRHt', owner: 'madhuridixitnene' },
  { code: 'CYMTXE0IqpP', owner: 'madhuridixitnene' },
  { code: 'CXVTbACA8m5', owner: 'madhuridixitnene' },
  { code: 'CXGvkOMAKlU', owner: 'madhuridixitnene' },
  { code: 'CW-mG8VAIg8', owner: 'madhuridixitnene' },
  { code: 'CW0tKMjgcAh', owner: 'madhuridixitnene' },
  { code: 'CWnyCdCgkoS', owner: 'madhuridixitnene' },
  { code: 'DLuy5FYM_z7', owner: 'shraddhakapoor' },
] as const;

// ── People ──────────────────────────────────────────────

interface Credit {
  title: string;
  organization: string;
  description?: string;
  startDate: string;
  endDate?: string;
}

interface DemoMember {
  key: string;
  name: string;
  role: Exclude<Role, 'ADMIN'>;
  location: string;
  bio: string;
  /** Obviously fake, so nobody mistakes demo data for a real number. */
  phone?: string;
  avatar?: string;
  skills: string[];
  credits: Credit[];
  photos?: { id: string; title: string }[];
  /** Indexes into REELS. */
  reels?: number[];
}

const MEMBERS: DemoMember[] = [
  {
    key: 'rhea',
    name: 'Rhea Malhotra',
    role: Role.PRODUCER,
    location: 'Mumbai, Maharashtra',
    bio: 'Independent producer behind three festival features and a streaming limited series. Currently developing a thriller set on the Konkan coast.',
    phone: '+91 90000 00001',
    avatar: PORTRAIT.womanBlazerOffice,
    skills: ['Film financing', 'Budgeting', 'Co-production'],
    credits: [
      {
        title: 'Producer — "Salt Water"',
        organization: 'Tidewater Pictures',
        description: 'Feature, 42-day shoot across Kerala and Goa.',
        startDate: '2023-02-01',
        endDate: '2024-06-30',
      },
      {
        title: 'Co-producer — "Night Market" (limited series)',
        organization: 'Lantern Street Studios',
        startDate: '2024-09-01',
      },
    ],
  },
  {
    key: 'kabir',
    name: 'Kabir Sen',
    role: Role.PRODUCER,
    location: 'Kolkata, West Bengal',
    bio: 'Line producer turned producer. Bengali and Hindi features, ad films, and one very long monsoon schedule.',
    avatar: PORTRAIT.manInSuit,
    skills: ['Line production', 'Scheduling', 'Bengali'],
    credits: [
      {
        title: 'Line producer — "Tram Lines"',
        organization: 'Hooghly Films',
        startDate: '2021-07-01',
        endDate: '2022-03-31',
      },
    ],
  },
  {
    key: 'raghav',
    name: 'Raghav Narayanan',
    role: Role.PRODUCER,
    location: 'Chennai, Tamil Nadu',
    bio: 'Thirty years in Tamil and Telugu production. Always reading scripts from first-time directors.',
    avatar: PORTRAIT.olderManGlasses,
    skills: ['Tamil', 'Telugu', 'Distribution'],
    credits: [
      {
        title: 'Executive producer — "Kalyanam Junction"',
        organization: 'Marina Talkies',
        startDate: '2019-01-01',
        endDate: '2020-02-28',
      },
    ],
  },
  {
    key: 'nikhil',
    name: 'Nikhil Deshpande',
    role: Role.DIRECTOR,
    location: 'Pune, Maharashtra',
    bio: 'Writer-director. Short films at regional festivals; first feature in pre-production.',
    avatar: PORTRAIT.manGlassesBeard,
    skills: ['Screenwriting', 'Marathi', 'Directing actors'],
    credits: [
      {
        title: 'Writer-director — "Deccan Queen" (short)',
        organization: 'Independent',
        startDate: '2024-01-15',
        endDate: '2024-04-30',
      },
    ],
    photos: [
      { id: FILM.theatreStage, title: 'Table read venue, Pune' },
      { id: FILM.neonCinemaFront, title: 'Premiere night' },
    ],
  },
  {
    key: 'ishita',
    name: 'Ishita Bose',
    role: Role.DIRECTOR,
    location: 'Kolkata, West Bengal',
    bio: 'Documentary and fiction director drawn to stories about work, cities and the women who run them.',
    avatar: PORTRAIT.womanBlueBackdrop,
    skills: ['Documentary', 'Bengali', 'Interview direction'],
    credits: [
      {
        title: 'Director — "Twelve Tram Stops" (documentary)',
        organization: 'Shoreline Docs',
        startDate: '2022-05-01',
        endDate: '2023-08-31',
      },
    ],
    photos: [{ id: FILM.redSeatsDim, title: 'Festival screening' }],
  },
  {
    key: 'arjun',
    name: 'Arjun Menon',
    role: Role.ACTOR,
    location: 'Kochi, Kerala',
    bio: 'Malayalam and English stage actor moving into film. Trained in Kalaripayattu; comfortable with action and stunt work.',
    phone: '+91 90000 00006',
    avatar: PORTRAIT.manGreySweater,
    skills: ['Malayalam', 'Kalaripayattu', 'Stage combat', 'Method acting'],
    credits: [
      {
        title: 'Lead — "The Boatman" (stage)',
        organization: 'Kochi Repertory',
        startDate: '2022-10-01',
        endDate: '2023-03-31',
      },
      {
        title: 'Supporting — "Salt Water"',
        organization: 'Tidewater Pictures',
        startDate: '2023-04-01',
        endDate: '2023-06-15',
      },
    ],
    photos: [
      { id: FILM.clapperboardDesert, title: 'On set — "Salt Water"' },
      { id: FILM.stageSilhouettes, title: '"The Boatman", curtain call' },
    ],
    reels: [0],
  },
  {
    key: 'priya',
    name: 'Priya Iyer',
    role: Role.ACTOR,
    location: 'Chennai, Tamil Nadu',
    bio: 'Bharatanatyam-trained actor working in Tamil, English and Hindi. Two web series and one feature so far.',
    avatar: PORTRAIT.womanDenimJacket,
    skills: ['Tamil', 'Bharatanatyam', 'Hindi', 'Dubbing'],
    credits: [
      {
        title: 'Lead — "Filter Coffee" (web series)',
        organization: 'Marina Talkies',
        startDate: '2023-06-01',
        endDate: '2023-09-30',
      },
    ],
    photos: [
      { id: FILM.actressWithClapper, title: 'Audition day' },
      { id: FILM.eyeBehindClapper, title: 'Look test' },
    ],
    reels: [1, 2],
  },
  {
    key: 'rohan',
    name: 'Rohan Gill',
    role: Role.ACTOR,
    location: 'Chandigarh, Punjab',
    bio: 'Punjabi and Hindi film actor. Horse riding, boxing, and a reliable crying scene.',
    avatar: PORTRAIT.manKnitSweater,
    skills: ['Punjabi', 'Horse riding', 'Boxing'],
    credits: [
      {
        title: 'Supporting — "Pind Diaries"',
        organization: 'Five Rivers Films',
        startDate: '2021-11-01',
        endDate: '2022-01-31',
      },
    ],
    photos: [{ id: FILM.theatreStage, title: 'Rehearsal hall' }],
    reels: [8],
  },
  {
    key: 'tanvi',
    name: 'Tanvi Kulkarni',
    role: Role.ACTOR,
    location: 'Pune, Maharashtra',
    bio: 'Marathi theatre regular with sharp comic timing. Looking for character roles in film and streaming.',
    avatar: PORTRAIT.smilingWomanRed,
    skills: ['Marathi', 'Improvisation', 'Comedy'],
    credits: [
      {
        title: 'Ensemble — "Wada Chirebandi" (revival)',
        organization: 'Pune Natya Sangh',
        startDate: '2024-02-01',
        endDate: '2024-05-31',
      },
    ],
    photos: [{ id: FILM.stageSilhouettes, title: 'Ensemble scene' }],
    reels: [3],
  },
  {
    key: 'dev',
    name: 'Dev Malik',
    role: Role.ACTOR,
    location: 'New Delhi, Delhi',
    bio: 'Ad films and television. Fluent in Hindi, English and Haryanvi.',
    avatar: PORTRAIT.smilingManWhiteTee,
    skills: ['Hindi', 'Haryanvi', 'Commercials'],
    credits: [
      {
        title: 'Lead — national telecom campaign',
        organization: 'Brightside Ads',
        startDate: '2024-07-01',
        endDate: '2024-07-15',
      },
    ],
    reels: [4],
  },
  {
    key: 'aisha',
    name: 'Aisha Fernandes',
    role: Role.ACTOR,
    location: 'Panaji, Goa',
    bio: 'Konkani, English and Portuguese. Musical theatre and voice work.',
    avatar: PORTRAIT.womanStripedTop,
    skills: ['Konkani', 'Portuguese', 'Singing', 'Voice-over'],
    credits: [
      {
        title: 'Lead vocalist — "Fado Nights" (musical)',
        organization: 'Panaji Arts Collective',
        startDate: '2023-11-01',
        endDate: '2024-01-31',
      },
    ],
    photos: [{ id: FILM.studioMicrophone, title: 'Recording session' }],
    reels: [5],
  },
  {
    key: 'nandini',
    name: 'Nandini Rao',
    role: Role.ACTOR,
    location: 'Hyderabad, Telangana',
    bio: 'Telugu and Kannada actor, trained at a Hyderabad acting school. Comfortable with dance numbers.',
    avatar: PORTRAIT.womanDarkStudio,
    skills: ['Telugu', 'Kannada', 'Kuchipudi'],
    credits: [
      {
        title: 'Supporting — "Charminar Express"',
        organization: 'Golconda Pictures',
        startDate: '2024-03-01',
        endDate: '2024-05-15',
      },
    ],
    photos: [{ id: FILM.actressWithClapper, title: 'Day one on set' }],
  },
  {
    key: 'farah',
    name: 'Farah Siddiqui',
    role: Role.ACTOR,
    location: 'Lucknow, Uttar Pradesh',
    bio: 'Urdu theatre and dastangoi performer. (No photo or portfolio on purpose — shows the empty states.)',
    skills: ['Urdu', 'Dastangoi'],
    credits: [],
  },
  {
    key: 'imran',
    name: 'Imran Shaikh',
    role: Role.CAMERA_OPERATOR,
    location: 'Mumbai, Maharashtra',
    bio: 'Steadicam and gimbal operator with twelve years on features and music videos.',
    avatar: PORTRAIT.beardedManProfile,
    skills: ['Steadicam', 'DJI Ronin', 'ARRI Alexa'],
    credits: [
      {
        title: 'Steadicam operator — "Night Market"',
        organization: 'Lantern Street Studios',
        startDate: '2024-09-01',
        endDate: '2024-12-20',
      },
      {
        title: 'Camera operator — music videos',
        organization: 'Freelance',
        startDate: '2015-01-01',
      },
    ],
    photos: [
      { id: FILM.cameraAndLens, title: 'A-camera build' },
      { id: FILM.mirrorlessKit, title: 'B-roll kit' },
      { id: FILM.projectorBeam, title: 'Rushes screening' },
    ],
    reels: [6],
  },
  {
    key: 'kavya',
    name: 'Kavya Reddy',
    role: Role.CAMERA_OPERATOR,
    location: 'Hyderabad, Telangana',
    bio: 'Focus puller and second-unit DoP. Works on ARRI and RED systems.',
    avatar: PORTRAIT.womanBobByLake,
    skills: ['Focus pulling', 'RED Komodo', 'Second unit'],
    credits: [
      {
        title: '1st AC — "Charminar Express"',
        organization: 'Golconda Pictures',
        startDate: '2024-03-01',
        endDate: '2024-05-15',
      },
    ],
    photos: [
      { id: FILM.mirrorlessKit, title: 'Lens test' },
      { id: FILM.filmReels, title: 'Archive transfer job' },
    ],
  },
  {
    key: 'neha',
    name: 'Neha Joshi',
    role: Role.EDITOR,
    location: 'Mumbai, Maharashtra',
    bio: 'Feature and documentary editor. DaVinci Resolve and Avid; happy to cut remotely.',
    avatar: PORTRAIT.womanHairBun,
    skills: ['DaVinci Resolve', 'Avid Media Composer', 'Colour grading'],
    credits: [
      {
        title: 'Editor — "Twelve Tram Stops"',
        organization: 'Shoreline Docs',
        startDate: '2023-01-01',
        endDate: '2023-08-31',
      },
    ],
    photos: [{ id: FILM.editingTimeline, title: 'Cutting room' }],
    reels: [7],
  },
  {
    key: 'sameer',
    name: 'Sameer Pillai',
    role: Role.OTHER_CREW,
    location: 'Kochi, Kerala',
    bio: 'Gaffer and lighting technician. Night exteriors are my favourite problem.',
    avatar: PORTRAIT.curlyManHat,
    skills: ['Gaffer', 'HMI lighting', 'Generator ops'],
    credits: [
      {
        title: 'Gaffer — "Salt Water"',
        organization: 'Tidewater Pictures',
        startDate: '2023-04-01',
        endDate: '2023-06-15',
      },
    ],
    photos: [
      { id: FILM.emptyCinemaAisle, title: 'Theatre relight' },
      { id: FILM.audienceInHall, title: 'Event lighting' },
    ],
  },
];

// ── Casting roles ───────────────────────────────────────

interface DemoRole {
  author: string;
  title: string;
  seekingRole: Exclude<Role, 'ADMIN'>;
  location: string;
  compensation: string;
  description: string;
  requirements: string;
  status: CastingRoleStatus;
  /** Days from today; negative is in the past; undefined is no deadline. */
  deadlineInDays?: number;
  /** For OPEN/CLOSED roles. */
  publishedDaysAgo?: number;
  closedDaysAgo?: number;
  /** Member keys, oldest application first. */
  applicants?: string[];
  /** Folder name → member keys filed in it. */
  folders?: Record<string, string[]>;
}

const ROLES: DemoRole[] = [
  {
    author: 'rhea',
    title: 'Lead — Meera, investigative journalist',
    seekingRole: Role.ACTOR,
    location: 'Kochi, Kerala',
    compensation: '₹15,000 per shooting day',
    description:
      'Meera uncovers a coastal land scam while her newspaper is being sold. Feature film, 40-day schedule from January.',
    requirements:
      'Female, 25–32. Fluent in Malayalam and English. Comfortable with night shoots and water scenes.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 21,
    publishedDaysAgo: 3,
    applicants: ['priya', 'tanvi', 'aisha', 'nandini', 'farah'],
    folders: { Callbacks: ['priya', 'aisha'], 'Strong maybe': ['tanvi'] },
  },
  {
    author: 'rhea',
    title: 'Steadicam operator — night market sequence',
    seekingRole: Role.CAMERA_OPERATOR,
    location: 'Panaji, Goa',
    compensation: '₹12,000 per day',
    description: 'A single-take, four-minute walk through a crowded night market. Three nights.',
    requirements: 'Own Steadicam rig preferred. Night exterior experience essential.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 5,
    publishedDaysAgo: 1,
    applicants: ['imran', 'kavya'],
    folders: { Shortlist: ['imran'] },
  },
  {
    author: 'kabir',
    title: 'Supporting — Bikash, tram conductor',
    seekingRole: Role.ACTOR,
    location: 'Kolkata, West Bengal',
    compensation: '₹8,000 per day',
    description: 'A warm, talkative conductor who knows every regular on the Esplanade route.',
    requirements: 'Male, 40–55. Bengali essential; Hindi a plus.',
    status: CastingRoleStatus.OPEN,
    publishedDaysAgo: 6,
    applicants: ['arjun', 'rohan', 'dev'],
    folders: { 'Second round': ['rohan'] },
  },
  {
    author: 'kabir',
    title: 'Editor — 90-minute documentary',
    seekingRole: Role.EDITOR,
    location: 'Kolkata or remote',
    compensation: '₹1,80,000, fixed fee',
    description: 'Sixty hours of observational footage about the last tram depot in the city.',
    requirements: 'Feature-length documentary credit. Resolve or Avid.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 45,
    publishedDaysAgo: 10,
    applicants: ['neha'],
  },
  {
    author: 'raghav',
    title: 'Comic lead — Shanthi, wedding planner',
    seekingRole: Role.ACTOR,
    location: 'Chennai, Tamil Nadu',
    compensation: '₹20,000 per day',
    description: 'A wedding planner juggling three weddings on the same auspicious day.',
    requirements: 'Female, 28–38. Tamil essential. Strong comic timing.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 60,
    publishedDaysAgo: 2,
    applicants: ['priya', 'nandini'],
  },
  {
    author: 'raghav',
    title: 'Gaffer — 30-day village schedule',
    seekingRole: Role.OTHER_CREW,
    location: 'Pollachi, Tamil Nadu',
    compensation: '₹6,500 per day',
    description: 'Period drama, mostly daylight exteriors with a week of night shoots.',
    requirements: 'Gaffer credit on at least one feature.',
    status: CastingRoleStatus.OPEN,
    // Expired: still OPEN, but hidden from browse and closed to applications.
    deadlineInDays: -2,
    publishedDaysAgo: 20,
    applicants: ['sameer'],
  },
  {
    author: 'nikhil',
    title: 'Short film — two strangers on the Deccan Queen',
    seekingRole: Role.ACTOR,
    location: 'Pune, Maharashtra',
    compensation: 'Unpaid — credit, meals and travel',
    description: 'A 12-minute two-hander shot on a moving train. Two shoot days.',
    requirements: 'Any gender, 22–35. Marathi or Hindi.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 10,
    publishedDaysAgo: 4,
    applicants: ['tanvi', 'rohan'],
  },
  {
    author: 'nikhil',
    title: 'Lead — untitled feature (draft)',
    seekingRole: Role.ACTOR,
    location: 'Pune, Maharashtra',
    compensation: 'To be confirmed',
    description: 'Only Nikhil can see this draft until it is published.',
    requirements: 'Details to follow.',
    status: CastingRoleStatus.DRAFT,
  },
  {
    author: 'ishita',
    title: 'Second-unit camera — documentary',
    seekingRole: Role.CAMERA_OPERATOR,
    location: 'Kolkata, West Bengal',
    compensation: '₹9,000 per day',
    description: 'Handheld observational footage around the tram depot.',
    requirements: 'Documentary experience; own camera body a plus.',
    status: CastingRoleStatus.CLOSED,
    deadlineInDays: -5,
    publishedDaysAgo: 25,
    closedDaysAgo: 3,
    applicants: ['kavya'],
  },
  {
    author: 'ishita',
    title: 'Voice-over — Bengali and English narration',
    seekingRole: Role.ACTOR,
    location: 'Kolkata or remote',
    compensation: '₹25,000, flat',
    description: 'Narration for a 52-minute documentary, two recording days.',
    requirements: 'Warm, unhurried delivery in Bengali and English.',
    status: CastingRoleStatus.OPEN,
    deadlineInDays: 30,
    publishedDaysAgo: 5,
    applicants: ['aisha', 'dev'],
  },
];

// ── Seeding ─────────────────────────────────────────────

export interface SeedDemoOptions {
  /** Delete existing demo accounts (only those) and recreate them. */
  fresh?: boolean;
  password?: string;
  /** Time reference for relative dates; defaults to now. */
  now?: Date;
  log?: (line: string) => void;
}

export interface SeedDemoResult {
  created: boolean;
  members: number;
  castingRoles: number;
  applications: number;
  folders: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emailFor(member: DemoMember): string {
  const [first, ...rest] = member.name.toLowerCase().split(' ');
  return `${first}.${rest.join('-')}@${DEMO_EMAIL_DOMAIN}`;
}

function calendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Delete demo accounts, and first any files they uploaded through the app. */
async function removeDemoAccounts(prisma: PrismaClient, log: (line: string) => void) {
  const demoFilter = { user: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } };
  const [profiles, items] = await Promise.all([
    prisma.profile.findMany({
      where: demoFilter,
      select: {
        profileImage: true,
        profileImageProvider: true,
        resumeKey: true,
        resumeProvider: true,
      },
    }),
    prisma.portfolioItem.findMany({
      where: { profile: demoFilter, provider: { not: StorageProvider.EXTERNAL } },
      select: { kind: true, provider: true, storageKey: true },
    }),
  ]);

  const files: (StoredFileRef & { provider: StorageProvider })[] = [];
  for (const profile of profiles) {
    if (profile.profileImage && profile.profileImageProvider !== StorageProvider.EXTERNAL) {
      files.push({
        provider: profile.profileImageProvider ?? StorageProvider.LOCAL,
        key: profile.profileImage,
        category: 'profile-photos',
        resourceType: 'image',
      });
    }
    if (profile.resumeKey && profile.resumeProvider !== StorageProvider.EXTERNAL) {
      files.push({
        provider: profile.resumeProvider ?? StorageProvider.LOCAL,
        key: profile.resumeKey,
        category: 'resumes',
        resourceType: 'raw',
      });
    }
  }
  for (const item of items) {
    const isPhoto = item.kind === PortfolioMediaKind.PHOTO;
    files.push({
      provider: item.provider,
      key: item.storageKey,
      category: isPhoto ? 'portfolio-photos' : 'reels',
      resourceType: isPhoto ? 'image' : 'video',
    });
  }

  if (files.length > 0) {
    // Loaded only when needed: uploads made while testing the demo accounts.
    const { storageFor } = await import('../src/config/storage');
    for (const { provider, ...file } of files) {
      await storageFor(provider)
        .remove(file)
        .catch((error: unknown) =>
          log(`  could not delete ${provider} ${file.key}: ${String(error)}`)
        );
    }
    log(`Deleted ${files.length} uploaded file(s) belonging to demo accounts.`);
  }

  const deleted = await prisma.user.deleteMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
  });
  log(`Removed ${deleted.count} demo account(s) and everything they owned.`);
}

async function skillIdFor(prisma: PrismaClient, name: string): Promise<string> {
  const normalizedName = normalizeSkillName(name);
  const skill = await prisma.skill.upsert({
    where: { normalizedName },
    create: { name, normalizedName },
    update: {},
    select: { id: true },
  });
  return skill.id;
}

export async function seedDemo(
  prisma: PrismaClient,
  options: SeedDemoOptions = {}
): Promise<SeedDemoResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? new Date();
  const password = options.password ?? DEFAULT_DEMO_PASSWORD;

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      `SEED_DEMO_PASSWORD must be ${MIN_PASSWORD_LENGTH}+ characters and at most ${MAX_PASSWORD_BYTES} bytes.`
    );
  }

  const existing = await prisma.user.count({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
  });
  if (existing > 0 && !options.fresh) {
    log(
      `Demo data already present (${existing} account(s) at @${DEMO_EMAIL_DOMAIN}). Nothing changed. ` +
        'Run with --fresh to delete and recreate it.'
    );
    return { created: false, members: existing, castingRoles: 0, applications: 0, folders: 0 };
  }
  if (existing > 0) await removeDemoAccounts(prisma, log);

  // One hash for every demo account: they share a password by design.
  const passwordHash = await hashPassword(password);
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - days * DAY_MS - hours * 3_600_000);

  // ── Members ──
  const userIds = new Map<string, string>();
  for (const [index, member] of MEMBERS.entries()) {
    const skillIds = await Promise.all(member.skills.map((skill) => skillIdFor(prisma, skill)));
    const user = await prisma.user.create({
      data: {
        name: member.name,
        email: emailFor(member),
        passwordHash,
        role: member.role,
        createdAt: ago(60 - index),
        profile: {
          create: {
            bio: member.bio,
            location: member.location,
            phone: member.phone ?? null,
            ...(member.avatar
              ? {
                  profileImage: avatarUrl(member.avatar),
                  profileImageUrl: avatarUrl(member.avatar),
                  profileImageProvider: StorageProvider.EXTERNAL,
                }
              : {}),
            skills: { create: skillIds.map((skillId) => ({ skillId })) },
            experiences: {
              create: member.credits.map((credit) => ({
                title: credit.title,
                organization: credit.organization,
                description: credit.description ?? null,
                startDate: calendarDate(credit.startDate),
                endDate: credit.endDate ? calendarDate(credit.endDate) : null,
              })),
            },
            portfolio: {
              create: [
                ...(member.photos ?? []).map((photo, order) => ({
                  kind: PortfolioMediaKind.PHOTO,
                  provider: StorageProvider.EXTERNAL,
                  storageKey: photoUrl(photo.id),
                  url: photoUrl(photo.id),
                  title: photo.title,
                  bytes: 0,
                  createdAt: ago(30, order),
                })),
                ...(member.reels ?? []).map((reelIndex, order) => {
                  const reel = REELS[reelIndex];
                  const url = `https://www.instagram.com/reel/${reel.code}/`;
                  return {
                    kind: PortfolioMediaKind.LINK,
                    provider: StorageProvider.EXTERNAL,
                    storageKey: url,
                    url,
                    title: `Sample reel — @${reel.owner}`,
                    bytes: 0,
                    createdAt: ago(29, order),
                  };
                }),
              ],
            },
          },
        },
      },
      select: { id: true },
    });
    userIds.set(member.key, user.id);
  }

  const memberByKey = new Map(MEMBERS.map((member) => [member.key, member]));
  const idOf = (key: string): string => {
    const id = userIds.get(key);
    if (!id) throw new Error(`Unknown demo member "${key}"`);
    return id;
  };

  // ── Casting roles, applications and folders ──
  let applications = 0;
  let folders = 0;
  for (const spec of ROLES) {
    const publishedAt = spec.publishedDaysAgo === undefined ? null : ago(spec.publishedDaysAgo);
    const closedAt = spec.closedDaysAgo === undefined ? null : ago(spec.closedDaysAgo);
    const role = await prisma.castingRole.create({
      data: {
        createdById: idOf(spec.author),
        title: spec.title,
        description: spec.description,
        requirements: spec.requirements,
        compensation: spec.compensation,
        location: spec.location,
        seekingRole: spec.seekingRole,
        status: spec.status,
        applicationDeadline:
          spec.deadlineInDays === undefined ? null : addDays(today(now), spec.deadlineInDays),
        publishedAt,
        closedAt,
        createdAt: publishedAt ? new Date(publishedAt.getTime() - 3_600_000) : ago(1),
      },
      select: { id: true },
    });

    // Applications obey the real rules, so the demo never shows impossible data.
    const applicationIds = new Map<string, string>();
    for (const [order, key] of (spec.applicants ?? []).entries()) {
      const member = memberByKey.get(key);
      if (!member || member.role !== spec.seekingRole || key === spec.author || !publishedAt) {
        throw new Error(`Demo data error: ${key} cannot apply to "${spec.title}"`);
      }
      // Spread out after publishing, and before closing or the deadline.
      const appliedAt = new Date(publishedAt.getTime() + (order + 1) * 5 * 3_600_000);
      const created = await prisma.application.create({
        data: { castingRoleId: role.id, applicantId: idOf(key), createdAt: appliedAt },
        select: { id: true },
      });
      applicationIds.set(key, created.id);
      applications += 1;
    }

    for (const [name, keys] of Object.entries(spec.folders ?? {})) {
      await prisma.shortlistFolder.create({
        data: {
          castingRoleId: role.id,
          name,
          normalizedName: normalizeFolderName(name),
          entries: {
            create: keys.map((key) => {
              const applicationId = applicationIds.get(key);
              if (!applicationId) throw new Error(`Demo data error: ${key} did not apply`);
              return { applicationId };
            }),
          },
        },
      });
      folders += 1;
    }
  }

  const result = {
    created: true,
    members: MEMBERS.length,
    castingRoles: ROLES.length,
    applications,
    folders,
  };
  log(
    `Seeded ${result.members} members, ${result.castingRoles} casting roles, ` +
      `${result.applications} applications and ${result.folders} shortlist folders.`
  );
  return result;
}

/** The accounts a tester signs in with, for the console summary. */
export function demoLogins(): { role: Role; name: string; email: string }[] {
  return MEMBERS.map((member) => ({
    role: member.role,
    name: member.name,
    email: emailFor(member),
  }));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('Refusing to seed demo data in production. Nothing was changed.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const password = process.env.SEED_DEMO_PASSWORD?.trim() || DEFAULT_DEMO_PASSWORD;
    const result = await seedDemo(prisma, {
      fresh: process.argv.includes('--fresh'),
      password,
    });
    if (!result.created) return;

    console.log(`\nSign in with any of these (password: ${password}):\n`);
    for (const login of demoLogins()) {
      console.log(`  ${login.role.padEnd(16)} ${login.name.padEnd(18)} ${login.email}`);
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Demo seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
