export const DomainEvents = {
  DraftCreated: 'draft-transaction.created',
  DraftApproved: 'draft-transaction.approved',
  TransactionCreated: 'transaction.created',
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
