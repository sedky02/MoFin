export const DomainEvents = {
  DraftCreated: 'draft-transaction.created',
  DraftApproved: 'draft-transaction.approved',
  TransactionCreated: 'transaction.created',
  // An existing transaction was edited, deleted or restored.
  TransactionChanged: 'transaction.changed',
  LedgerEntriesCreated: 'ledger.entries-created',
  AnalyticsRefreshRequested: 'analytics.refresh-requested'
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
  userId: string;
  occurredAt: Date;
}

/** Emitted once per month a change touched: an edit that moves the date emits for both months. */
export interface TransactionChangedEvent {
  transactionId: string;
  userId: string;
  occurredAt: Date;
}
