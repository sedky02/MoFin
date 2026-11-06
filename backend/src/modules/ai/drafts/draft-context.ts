import { ParsedDraftTransaction } from '../../draft-transactions/dto/draft-transactions.dto';

export interface DraftAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  /** The account's owner: whose categories fit it. */
  userId?: string;
}

export interface DraftCategory {
  id: string;
  name: string;
  type: string;
  /** Whose it is; null for a global category, which fits every account. */
  userId?: string | null;
}

/** Everything a parser needs to know about the user to read one message. */
export interface DraftContext {
  input: string;
  accounts: DraftAccount[];
  categories: DraftCategory[];
  defaultAccountId?: string;
  defaultCurrency?: string;
  /** The user's IANA zone; "yesterday" and "today" are read in it. */
  timeZone: string;
  /** Today's date (YYYY-MM-DD) in `timeZone`. */
  today: string;
  now: Date;
}

/** One draft a parser proposes, with how sure it is (0..1). */
export interface ProposedDraft {
  data: ParsedDraftTransaction;
  confidence: number;
}
