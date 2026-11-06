import {
  AccountAction,
  AccountRole,
  accountScope,
  can,
} from './account-access';

const ROLES: AccountRole[] = ['OWNER', 'EDITOR', 'VIEWER'];

// Written out in full on purpose: this is the permission model as a table, so
// changing a rule means changing a line here too.
const EXPECTED: Record<AccountAction, Record<AccountRole, boolean>> = {
  view: { OWNER: true, EDITOR: true, VIEWER: true },
  transact: { OWNER: true, EDITOR: true, VIEWER: false },
  goals: { OWNER: true, EDITOR: true, VIEWER: false },
  manage: { OWNER: true, EDITOR: false, VIEWER: false },
  leave: { OWNER: false, EDITOR: true, VIEWER: true },
};

describe('can', () => {
  for (const action of Object.keys(EXPECTED) as AccountAction[]) {
    for (const role of ROLES) {
      it(`${role} ${EXPECTED[action][role] ? 'may' : 'may not'} ${action}`, () => {
        expect(can(role, action)).toBe(EXPECTED[action][role]);
      });
    }
  }
});

describe('accountScope', () => {
  it('reaches accounts as owner or as a member of any role, to view', () => {
    expect(accountScope('u', 'view')).toEqual({
      OR: [
        { userId: 'u' },
        {
          members: {
            some: { userId: 'u', role: { in: ['EDITOR', 'VIEWER'] } },
          },
        },
      ],
    });
  });

  it('leaves viewers out of writes', () => {
    expect(accountScope('u', 'transact')).toEqual({
      OR: [
        { userId: 'u' },
        { members: { some: { userId: 'u', role: { in: ['EDITOR'] } } } },
      ],
    });
  });

  it('is the owner alone for managing', () => {
    expect(accountScope('u', 'manage')).toEqual({ OR: [{ userId: 'u' }] });
  });

  it('never matches the owner for leaving', () => {
    expect(accountScope('u', 'leave')).toEqual({
      OR: [
        {
          members: {
            some: { userId: 'u', role: { in: ['EDITOR', 'VIEWER'] } },
          },
        },
      ],
    });
  });
});
