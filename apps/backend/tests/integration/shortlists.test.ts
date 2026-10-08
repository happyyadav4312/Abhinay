import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { LIMITS } from '../../src/validators/common';
import {
  applyTo,
  bearer,
  createCastingRole,
  disconnect,
  registerUser,
  RegisteredUser,
  resetDatabase,
} from '../helpers';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface Scene {
  producer: RegisteredUser;
  roleId: string;
  actors: RegisteredUser[];
  applicationIds: string[];
}

/** A producer's OPEN role with `count` actors applied to it, oldest application first. */
async function scene(count = 2): Promise<Scene> {
  const producer = await registerUser(app, { role: Role.PRODUCER, name: 'Priya Producer' });
  const role = await createCastingRole(app, producer.accessToken, {}, { publish: true });

  const actors: RegisteredUser[] = [];
  const applicationIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const actor = await registerUser(app, { role: Role.ACTOR, name: `Actor ${index + 1}` });
    const applied = await applyTo(app, actor.accessToken, role.id);
    actors.push(actor);
    applicationIds.push(applied.body.data.application.id);
  }
  return { producer, roleId: role.id, actors, applicationIds };
}

function createFolder(token: string, roleId: string, name: string) {
  return request(app)
    .post(`/api/v1/casting/${roleId}/shortlists`)
    .set(bearer(token))
    .send({ name });
}

function file(token: string, roleId: string, folderId: string, applicationId: string) {
  return request(app)
    .put(`/api/v1/casting/${roleId}/shortlists/${folderId}/applications/${applicationId}`)
    .set(bearer(token));
}

beforeEach(resetDatabase);
afterAll(disconnect);

describe('applicant list', () => {
  it('shows the author each applicant’s public facts, newest first, and nothing private', async () => {
    const { producer, roleId, actors } = await scene(2);

    const res = await request(app)
      .get(`/api/v1/casting/${roleId}/applications`)
      .set(bearer(producer.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    const [newest] = res.body.data.applicants;
    expect(newest).toMatchObject({
      status: 'APPLIED',
      folderIds: [],
      applicant: { name: 'Actor 2', role: 'ACTOR', profileId: actors[1].profileId },
    });

    const body = JSON.stringify(res.body);
    for (const actor of actors) {
      expect(body).not.toContain(actor.email);
      expect(body).not.toContain(actor.userId);
    }
  });

  it('is closed to other producers (404), to other professions (403) and to anonymous callers', async () => {
    const { roleId, actors } = await scene(1);
    const rival = await registerUser(app, { role: Role.PRODUCER });

    const asRival = await request(app)
      .get(`/api/v1/casting/${roleId}/applications`)
      .set(bearer(rival.accessToken));
    expect(asRival.status).toBe(404);

    const asApplicant = await request(app)
      .get(`/api/v1/casting/${roleId}/applications`)
      .set(bearer(actors[0].accessToken));
    expect(asApplicant.status).toBe(403);

    expect((await request(app).get(`/api/v1/casting/${roleId}/applications`)).status).toBe(401);
  });

  it('answers 404 for an unknown or malformed role id', async () => {
    const { producer } = await scene(0);
    for (const id of [UNKNOWN_ID, 'nope']) {
      const res = await request(app)
        .get(`/api/v1/casting/${id}/applications`)
        .set(bearer(producer.accessToken));
      expect(res.status).toBe(404);
    }
  });
});

describe('shortlist folders', () => {
  it('creates, lists with counts, renames and deletes a folder', async () => {
    const { producer, roleId, applicationIds } = await scene(2);

    const created = await createFolder(producer.accessToken, roleId, '  Callbacks  ');
    expect(created.status).toBe(201);
    const folder = created.body.data.folder;
    expect(folder).toMatchObject({ name: 'Callbacks', applicantCount: 0 });

    await file(producer.accessToken, roleId, folder.id, applicationIds[0]);

    const listed = await request(app)
      .get(`/api/v1/casting/${roleId}/shortlists`)
      .set(bearer(producer.accessToken));
    expect(listed.body.data.folders).toEqual([
      expect.objectContaining({ id: folder.id, name: 'Callbacks', applicantCount: 1 }),
    ]);

    const renamed = await request(app)
      .patch(`/api/v1/casting/${roleId}/shortlists/${folder.id}`)
      .set(bearer(producer.accessToken))
      .send({ name: 'Second round' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.folder).toMatchObject({ name: 'Second round', applicantCount: 1 });

    const deleted = await request(app)
      .delete(`/api/v1/casting/${roleId}/shortlists/${folder.id}`)
      .set(bearer(producer.accessToken));
    expect(deleted.status).toBe(204);

    // The folder and its entries are gone; the applications are untouched.
    expect(await prisma.shortlistEntry.count()).toBe(0);
    expect(await prisma.application.count()).toBe(2);
  });

  it('treats names that differ only in case or spacing as the same folder', async () => {
    const { producer, roleId } = await scene(0);
    await createFolder(producer.accessToken, roleId, 'Callbacks');

    const duplicate = await createFolder(producer.accessToken, roleId, '  CALLBACKS ');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('FOLDER_NAME_TAKEN');
    expect(duplicate.body.error.fieldErrors.name).toBeDefined();

    // Renaming onto another folder's name is the same conflict; renaming to its own is fine.
    const other = await createFolder(producer.accessToken, roleId, 'Maybe');
    const clash = await request(app)
      .patch(`/api/v1/casting/${roleId}/shortlists/${other.body.data.folder.id}`)
      .set(bearer(producer.accessToken))
      .send({ name: 'callbacks' });
    expect(clash.status).toBe(409);

    const recase = await request(app)
      .patch(`/api/v1/casting/${roleId}/shortlists/${other.body.data.folder.id}`)
      .set(bearer(producer.accessToken))
      .send({ name: 'MAYBE' });
    expect(recase.status).toBe(200);
  });

  it('lets two roles use the same folder name independently', async () => {
    const first = await scene(0);
    const second = await createCastingRole(app, first.producer.accessToken, {}, { publish: true });

    expect((await createFolder(first.producer.accessToken, first.roleId, 'Callbacks')).status).toBe(
      201
    );
    expect((await createFolder(first.producer.accessToken, second.id, 'Callbacks')).status).toBe(
      201
    );
  });

  it('caps the number of folders per role', async () => {
    const { producer, roleId } = await scene(0);
    for (let index = 0; index < LIMITS.SHORTLIST_FOLDERS_PER_ROLE_MAX; index += 1) {
      expect((await createFolder(producer.accessToken, roleId, `Folder ${index}`)).status).toBe(
        201
      );
    }
    const over = await createFolder(producer.accessToken, roleId, 'One too many');
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('LIMIT_EXCEEDED');
  });

  it('validates the name and rejects extra fields', async () => {
    const { producer, roleId } = await scene(0);
    expect((await createFolder(producer.accessToken, roleId, '   ')).status).toBe(422);
    expect(
      (
        await createFolder(
          producer.accessToken,
          roleId,
          'x'.repeat(LIMITS.SHORTLIST_FOLDER_NAME_MAX + 1)
        )
      ).status
    ).toBe(422);
    const injected = await request(app)
      .post(`/api/v1/casting/${roleId}/shortlists`)
      .set(bearer(producer.accessToken))
      .send({ name: 'Callbacks', castingRoleId: UNKNOWN_ID });
    expect(injected.status).toBe(422);
  });

  it('keeps another producer out of every folder operation', async () => {
    const { producer, roleId, applicationIds } = await scene(1);
    const folder = (await createFolder(producer.accessToken, roleId, 'Callbacks')).body.data.folder;
    const rival = await registerUser(app, { role: Role.PRODUCER });
    const as = bearer(rival.accessToken);
    const base = `/api/v1/casting/${roleId}/shortlists`;

    expect((await request(app).get(base).set(as)).status).toBe(404);
    expect((await request(app).post(base).set(as).send({ name: 'Mine now' })).status).toBe(404);
    expect(
      (await request(app).patch(`${base}/${folder.id}`).set(as).send({ name: 'Renamed' })).status
    ).toBe(404);
    expect((await request(app).delete(`${base}/${folder.id}`).set(as)).status).toBe(404);
    expect(
      (await request(app).put(`${base}/${folder.id}/applications/${applicationIds[0]}`).set(as))
        .status
    ).toBe(404);

    // Nothing changed.
    const row = await prisma.shortlistFolder.findUniqueOrThrow({ where: { id: folder.id } });
    expect(row.name).toBe('Callbacks');
    expect(await prisma.shortlistFolder.count()).toBe(1);
    expect(await prisma.shortlistEntry.count()).toBe(0);
  });

  it('answers 403 to an actor before ownership is considered', async () => {
    const { roleId, actors } = await scene(1);
    const res = await createFolder(actors[0].accessToken, roleId, 'Sneaky');
    expect(res.status).toBe(403);
  });
});

describe('filing applicants', () => {
  it('files an applicant (201), is idempotent (200), and filters the list by folder', async () => {
    const { producer, roleId, applicationIds } = await scene(3);
    const folder = (await createFolder(producer.accessToken, roleId, 'Callbacks')).body.data.folder;

    const first = await file(producer.accessToken, roleId, folder.id, applicationIds[1]);
    expect(first.status).toBe(201);
    expect(first.body.data.applicant).toMatchObject({
      applicationId: applicationIds[1],
      folderIds: [folder.id],
      // Filing is organisation only — the status workflow is WBS 1.3.
      status: 'APPLIED',
    });

    const again = await file(producer.accessToken, roleId, folder.id, applicationIds[1]);
    expect(again.status).toBe(200);
    expect(await prisma.shortlistEntry.count()).toBe(1);

    const filtered = await request(app)
      .get(`/api/v1/casting/${roleId}/applications?folderId=${folder.id}`)
      .set(bearer(producer.accessToken));
    expect(filtered.body.data.pagination.total).toBe(1);
    expect(filtered.body.data.applicants[0].applicationId).toBe(applicationIds[1]);
  });

  it('lets one applicant sit in several folders, and removes them from one', async () => {
    const { producer, roleId, applicationIds } = await scene(1);
    const a = (await createFolder(producer.accessToken, roleId, 'Callbacks')).body.data.folder;
    const b = (await createFolder(producer.accessToken, roleId, 'Strong')).body.data.folder;

    await file(producer.accessToken, roleId, a.id, applicationIds[0]);
    const both = await file(producer.accessToken, roleId, b.id, applicationIds[0]);
    expect(both.body.data.applicant.folderIds).toEqual([a.id, b.id]);

    const removed = await request(app)
      .delete(`/api/v1/casting/${roleId}/shortlists/${a.id}/applications/${applicationIds[0]}`)
      .set(bearer(producer.accessToken));
    expect(removed.status).toBe(204);

    const again = await request(app)
      .delete(`/api/v1/casting/${roleId}/shortlists/${a.id}/applications/${applicationIds[0]}`)
      .set(bearer(producer.accessToken));
    expect(again.status).toBe(404);

    const list = await request(app)
      .get(`/api/v1/casting/${roleId}/applications`)
      .set(bearer(producer.accessToken));
    expect(list.body.data.applicants[0].folderIds).toEqual([b.id]);
  });

  it('refuses an application from a different role, and unknown folders or applications', async () => {
    const { producer, roleId } = await scene(0);
    const folder = (await createFolder(producer.accessToken, roleId, 'Callbacks')).body.data.folder;

    // An application to another producer's role must not be filed here.
    const elsewhere = await scene(1);
    const foreign = await file(
      producer.accessToken,
      roleId,
      folder.id,
      elsewhere.applicationIds[0]
    );
    expect(foreign.status).toBe(404);

    expect((await file(producer.accessToken, roleId, folder.id, UNKNOWN_ID)).status).toBe(404);
    expect((await file(producer.accessToken, roleId, UNKNOWN_ID, UNKNOWN_ID)).status).toBe(404);

    const unknownFolderFilter = await request(app)
      .get(`/api/v1/casting/${roleId}/applications?folderId=${UNKNOWN_ID}`)
      .set(bearer(producer.accessToken));
    expect(unknownFolderFilter.status).toBe(404);

    expect(await prisma.shortlistEntry.count()).toBe(0);
  });

  it('keeps working after the role is closed', async () => {
    const { producer, roleId, applicationIds } = await scene(1);
    await request(app)
      .patch(`/api/v1/casting/${roleId}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: 'CLOSED' });

    const folder = await createFolder(producer.accessToken, roleId, 'Final picks');
    expect(folder.status).toBe(201);
    expect(
      (await file(producer.accessToken, roleId, folder.body.data.folder.id, applicationIds[0]))
        .status
    ).toBe(201);
  });
});
