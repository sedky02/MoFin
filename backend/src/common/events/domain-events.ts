export const DomainEvents = {
  DraftCreated: 'draft-transaction.created',
  DraftApproved: 'draft-transaction.approved',
  TransactionCreated: 'transaction.created',
  // An existing transaction was edited, deleted or restored.
  TransactionChanged: 'transaction.changed',
  LedgerEntriesCreated: 'ledger.entries-created',
  AnalyticsRefreshRequested: 'analytics.refresh-requested',
  // Who can reach an account changed: a member joined, left or was removed, or it changed owner.
  AccountAccessChanged: 'account.access-changed',
} as const;

export interface DraftCreatedEvent {
  draftId: string;
  userId: string;
}

export interface DraftApprovedEvent {
  draftId: string;
  transactionId: string;
  userId: string;
}

export interface TransactionCreatedEvent {
  transactionId: string;
  /** Whose ledger it is on. */
  userId: string;
  occurredAt: Date;
  /** The accounts it touches: everyone who can reach one has stale figures. */
  accountIds: string[];
}

/** The people whose set of reachable accounts just changed. */
export interface AccountAccessChangedEvent {
  userIds: string[];
}

/** Emitted once per month a change touched: an edit that moves the date emits for both months. */
export interface TransactionChangedEvent {
  transactionId: string;
  /** Whose ledger it is on. */
  userId: string;
  occurredAt: Date;
  /** The accounts it touched, before and after. */
  accountIds: string[];
}
