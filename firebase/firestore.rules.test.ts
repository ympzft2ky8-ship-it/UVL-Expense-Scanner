import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const MEMBER = 'member-one@example.com';
const COLLECTIONS = ['properties', 'vendors', 'receipts', 'yearMeta', 'blobs', 'usage', 'config'];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-uvl',
    firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(() => env.cleanup());

const as = (email: string, verified: boolean) => env.authenticatedContext(email.replace(/\W/g, '_'), { email, email_verified: verified }).firestore();

describe('members-only access', () => {
  for (const col of COLLECTIONS) {
    it(`${col}: a verified member can read and write`, async () => {
      const db = as(MEMBER, true);
      await assertSucceeds(setDoc(doc(db, col, 'x'), { ok: true }));
      await assertSucceeds(getDoc(doc(db, col, 'x')));
      await assertSucceeds(deleteDoc(doc(db, col, 'x')));
    });

    it(`${col}: signed-out visitors are refused`, async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, col, 'x')));
      await assertFails(setDoc(doc(db, col, 'x'), { ok: true }));
    });

    it(`${col}: a verified non-member is refused`, async () => {
      const db = as('stranger@example.com', true);
      await assertFails(getDoc(doc(db, col, 'x')));
      await assertFails(setDoc(doc(db, col, 'x'), { ok: true }));
    });

    it(`${col}: a member address that is not verified is refused`, async () => {
      // Someone who registers a member's address but cannot open that inbox gets nothing.
      const db = as(MEMBER, false);
      await assertFails(getDoc(doc(db, col, 'x')));
      await assertFails(setDoc(doc(db, col, 'x'), { ok: true }));
    });
  }

  it('the second member is allowed too', async () => {
    await assertSucceeds(getDoc(doc(as('member-two@example.com', true), 'receipts', 'x')));
  });
});
