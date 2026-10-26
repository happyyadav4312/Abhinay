import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ApplicationStatus, Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import {
  applyTo,
  bearer,
  createCastingRole,
  disconnect,
  registerUser,
  resetDatabase,
} from '../helpers';

beforeEach(resetDatabase);
afterAll(disconnect);

describe('Notifications & Application Status Workflow', () => {
  it('notifies applicant when author updates application status', async () => {
    // 1. Producer creates role
    const producer = await registerUser(app, { name: 'Producer Pete', role: Role.PRODUCER });
    const role = await createCastingRole(
      app,
      producer.accessToken,
      { seekingRole: Role.ACTOR, title: 'Lead Role' },
      { publish: true }
    );

    // 2. Actor applies
    const actor = await registerUser(app, { name: 'Actor Alice', role: Role.ACTOR });
    const applyRes = await applyTo(app, actor.accessToken, role.id);
    expect(applyRes.status).toBe(201);
    const applicationId = applyRes.body.data.application.id;

    // Initially, actor has 0 notifications
    const initialNotes = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(actor.accessToken));
    expect(initialNotes.status).toBe(200);
    expect(initialNotes.body.data.notifications).toHaveLength(0);
    expect(initialNotes.body.data.unreadCount).toBe(0);

    // 3. Producer updates status to SHORTLISTED
    const patchRes = await request(app)
      .patch(`/api/v1/casting/${role.id}/applications/${applicationId}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: ApplicationStatus.SHORTLISTED });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.applicant.status).toBe('SHORTLISTED');

    // 4. Actor should now have a notification
    const notesAfter = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(actor.accessToken));
    expect(notesAfter.status).toBe(200);
    expect(notesAfter.body.data.notifications).toHaveLength(1);
    expect(notesAfter.body.data.unreadCount).toBe(1);

    const note = notesAfter.body.data.notifications[0];
    expect(note.read).toBe(false);
    expect(note.type).toBe('APPLICATION_SHORTLISTED');
    expect(note.relatedApplicationId).toBe(applicationId);

    // 5. Mark notification as read
    const markRes = await request(app)
      .patch(`/api/v1/notifications/${note.id}/read`)
      .set(bearer(actor.accessToken));
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.notification.read).toBe(true);

    // 6. Check unread count is now 0
    const unreadCheck = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set(bearer(actor.accessToken));
    expect(unreadCheck.body.data.notifications).toHaveLength(0);
    expect(unreadCheck.body.data.unreadCount).toBe(0);

    // 7. Producer changes status to SELECTED
    await request(app)
      .patch(`/api/v1/casting/${role.id}/applications/${applicationId}/status`)
      .set(bearer(producer.accessToken))
      .send({ status: ApplicationStatus.SELECTED });

    // 8. Test mark-all-as-read
    const markAllRes = await request(app)
      .post('/api/v1/notifications/read-all')
      .set(bearer(actor.accessToken));
    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.data.count).toBe(1);

    const finalNotes = await request(app)
      .get('/api/v1/notifications')
      .set(bearer(actor.accessToken));
    expect(finalNotes.body.data.unreadCount).toBe(0);
  });

  it('prevents non-authors from updating application status', async () => {
    const producer = await registerUser(app, { role: Role.PRODUCER });
    const otherProducer = await registerUser(app, { role: Role.PRODUCER });
    const role = await createCastingRole(
      app,
      producer.accessToken,
      { seekingRole: Role.ACTOR, title: 'Hero' },
      { publish: true }
    );
    const actor = await registerUser(app, { role: Role.ACTOR });
    const applyRes = await applyTo(app, actor.accessToken, role.id);
    const applicationId = applyRes.body.data.application.id;

    const res = await request(app)
      .patch(`/api/v1/casting/${role.id}/applications/${applicationId}/status`)
      .set(bearer(otherProducer.accessToken))
      .send({ status: ApplicationStatus.SHORTLISTED });

    expect(res.status).toBe(404);
  });
});
