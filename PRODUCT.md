# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Talent & Crew**: Actors, Directors, Camera Operators, Editors, and Other Crew in the film industry looking to maintain an industry-standard professional profile, showcase credits and media (headshots, video showreels, and PDF CV), and discover and apply to verified casting roles tailored to their profession.
- **Production Leaders / Casting Directors**: Producers and Directors seeking talent for upcoming film, TV, or commercial projects. They create casting calls, review eligible applicant submissions with attached media, and organize candidates into private shortlist folders.
- **Out of Scope Audiences**: Platform Administrators (managed strictly via out-of-band database or seed credentials; no public registration, admin dashboard is currently a non-goal).

## Product Purpose

Abhinay is a dedicated, professional networking and casting platform built specifically for the film and television production industry. It bridges the gap between filmmakers and talent by providing media-rich professional profiles (headshots, video showreels, credits, and resumes) and a structured casting marketplace with strict profession-matching, calendar deadlines, and private applicant shortlisting. Success means casting roles are filled efficiently with verified, relevant industry talent while creative professionals have a trustworthy, dignified platform to showcase their craft.

## Positioning

A focused, media-rich film casting and production network with enforced profession eligibility (applicants apply only to roles seeking their registered profession), strict calendar-day application deadlines, server-enforced privacy boundaries (private applicant shortlists, non-serialized internal IDs, no public exposure of contact details or user IDs), and integrated media storage (Cloudinary showreels and photo portfolios) tailored specifically to entertainment production workflows.

## Operating Context

- **Industry Realities**: Film casting calls, audition submissions, and crew hiring revolve around tight production schedules, hard calendar deadlines, and strict union/discipline roles.
- **Media-Driven Evaluation**: Casting directors and producers evaluate talent through visual media: high-resolution headshots, video showreels (MP4/MOV/WebM up to 100MB / 3 mins), and standardized PDF resumes/CVs (up to 5MB).
- **Dual-Device Environment**: Producers and directors manage postings, review submissions, and organize applicant folders primarily on desktop monitors and laptops; talent browse casting calls and check application status on mobile devices on set or on the go as well as on desktop.
- **System Architecture**: Full-stack web application with a Next.js App Router client communicating over HTTP REST with an Express API, PostgreSQL database via Prisma ORM, and Cloudinary media storage.

## Capabilities and Constraints

- **Confirmed Capabilities**:
  - User authentication via JWT access tokens and HttpOnly refresh cookies with atomic rotation, RBAC, and rate limiting.
  - Six public professions chosen at registration: `ACTOR`, `DIRECTOR`, `PRODUCER`, `CAMERA_OPERATOR`, `EDITOR`, `OTHER_CREW`.
  - Professional profile management: bio, location, phone, headshot photo, skills tagging, chronological experience/credits, single PDF CV, up to 12 portfolio photos, and up to 4 video reels with captions.
  - Public profile view (`/profile/:id`) accessible without authentication, exposing only verified public facts and delivery media URLs.
  - Casting marketplace: Producers and Directors create, edit, draft, and publish casting calls with title, description, requirements, compensation, location, seeking profession, and optional deadline date (up to 365 days).
  - Role Discovery & Applications: Signed-in users browse OPEN roles, search, filter by profession/location/deadline, and apply if their profession matches `seekingRole` (one application per role).
  - Shortlist Management: Role authors organize applicants into up to 20 custom shortlist folders per role, with applicant details restricted to public data.
- **Constraints & Out of Scope (Non-Goals)**:
  - No direct messaging, audition scheduling, or self-tape video recording features yet (Messages is a disabled placeholder).
  - No social feed, public posts, or project pages yet.
  - No public registration or admin dashboard for `ADMIN`.
  - No user-initiated application withdrawals.
  - Strictly preserve existing backend endpoints, database schema, and test suite contracts.

## Brand Commitments

- **Name**: Abhinay (denoting "acting/expression" in Sanskrit and Indian performing arts).
- **Aesthetic Tone**: Cinematic, premium, editorial, and trustworthy. Inspired by fine film publications, high-end production houses, and professional creative platforms.
- **Visual Identity Direction**: Deep charcoal / near-black base with warm ivory surfaces and subtle, refined accents (e.g., muted gold or burgundy) used with restraint. Generous whitespace, disciplined typography hierarchy, and deliberate editorial structure.
- **Banned Treatments**: Avoid generic AI SaaS styling, heavy neon gradients, bloated pill buttons, unnecessary glassmorphism, aggressive drop-shadows, emoji icons, and cluttered, repetitive card grids.

## Evidence on Hand

- `docs/requirements.md`: Comprehensive WBS 1.1 (Profiles) and WBS 1.2 (Casting Marketplace) functional requirements.
- `docs/api.md`: Complete OpenAPI / REST specification covering auth, profiles, media, casting, applications, and shortlists.
- `docs/implementation-decisions.md`: Architectural decisions regarding tokens, Cloudinary, pagination, and data constraints.
- Test suites & fixtures: `tests/integration/` (Vitest/Supertest) and `tests/e2e/` (Playwright) verifying end-to-end user journeys.

## Product Principles

1. **Respect the Production Workflow**: Every workflow—from casting call deadlines to role eligibility and applicant shortlisting—must reflect how real film and television productions cast and hire.
2. **Media and Craft First**: Talent is evaluated on creative output; headshots, showreels, and credits must take center stage with high-fidelity presentation and zero layout distraction.
3. **Privacy and Role Integrity**: Contact info, internal identifiers, and shortlist decisions belong strictly to authorized parties; applicants are never exposed beyond their intended public profile facts.
4. **Cinematic Restraint**: Every UI component should feel deliberate, quiet, and editorially grounded, letting production posters and talent media provide the emotional resonance.

## Accessibility & Inclusion

- Conformance to WCAG 2.1 AA across dark and warm surfaces with accessible contrast ratios.
- Full keyboard navigability and focus management across forms, casting search filters, and media galleries.
- Accessible error states with clear field-level feedback and machine-readable error communication.
