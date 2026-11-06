import { Injectable, Logger } from '@nestjs/common';
import { DraftTransaction } from '@prisma/client';
import { localDate } from '../../common/utils/time-zone';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { ParseTransactionIntentDto } from './dto/ai.dto';
import { DraftContext, ProposedDraft } from './drafts/draft-context';
import { repairDraft } from './drafts/draft-repairer';
import { ModelDraftParser } from './drafts/model-draft-parser';
import { parseWithRegex } from './drafts/regex-draft-parser';
import { isAiProviderFailure } from './llm/ai-unavailable.exception';

/** How many accounts and categories the model is shown (the list API's max). */
export const CONTEXT_LIST_LIMIT = 100;

/**
 * Turns one sentence into PENDING drafts. The pieces:
 * - ModelDraftParser asks the model and shape-checks its JSON;
 * - repairDraft keeps only ids the user owns and lowers the confidence of
 *   anything it had to fix;
 * - parseWithRegex answers when there is no model or it fails, so the box
 *   never stops working.
 * The user still approves every draft by hand: the model only proposes.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly draftsService: DraftTransactionsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly modelParser: ModelDraftParser,
  ) {}

  async createDraftsFromNaturalLanguage(
    userId: string,
    dto: ParseTransactionIntentDto,
  ): Promise<DraftTransaction[]> {
    const ctx = await this.context(userId, dto);
    const proposed = await this.propose(ctx);
    return this.draftsService.createMany(
      userId,
      proposed.map(({ data, confidence }) => ({
        rawInput: dto.input,
        parsedData: data,
        confidenceScore: confidence,
      })),
    );
  }

  private async propose(ctx: DraftContext): Promise<ProposedDraft[]> {
    if (!this.modelParser.enabled) {
      this.logger.warn('AI_API_KEY is not set, using the local parser');
      return [parseWithRegex(ctx)];
    }
    try {
      const drafts = await this.modelParser.parse(ctx);
      if (drafts) return drafts.map((draft) => repairDraft(draft, ctx));
      this.logger.warn(
        'Model gave invalid drafts twice, using the local parser',
      );
    } catch (error) {
      // A provider outage must not block drafting: fall through to the regex.
      if (!isAiProviderFailure(error)) throw error;
      this.logger.warn(
        `Model unavailable (${error.message}), using the local parser`,
      );
    }
    return [parseWithRegex(ctx)];
  }

  /**
   * What a parser needs to read one message for this user: their accounts and
   * categories, and today in their time zone. Shared with the chat, whose
   * create_draft_transaction goes through the same checks.
   */
  async draftContext(
    userId: string,
    dto: ParseTransactionIntentDto,
  ): Promise<DraftContext> {
    return this.context(userId, dto);
  }

  private async context(
    userId: string,
    dto: ParseTransactionIntentDto,
  ): Promise<DraftContext> {
    const [accounts, categories] = await Promise.all([
      this.accountsService.list(userId, {
        status: 'active',
        limit: CONTEXT_LIST_LIMIT,
        offset: 0,
      }),
      this.categoriesService.list(userId, {
        status: 'active',
        limit: CONTEXT_LIST_LIMIT,
        offset: 0,
      }),
    ]);
    // Past the limit the model can't see some ids, and repairDraft drops any
    // it guesses. Rare enough to only log for now.
    if (accounts.total > accounts.data.length) {
      this.logger.warn(
        `Drafting with ${accounts.data.length} of ${accounts.total} accounts in context`,
      );
    }
    if (categories.total > categories.data.length) {
      this.logger.warn(
        `Drafting with ${categories.data.length} of ${categories.total} categories in context`,
      );
    }
    const now = new Date();
    const timeZone = dto.timeZone ?? 'UTC';
    return {
      input: dto.input,
      accounts: accounts.data,
      categories: categories.data,
      defaultAccountId: dto.defaultAccountId,
      defaultCurrency: dto.defaultCurrency,
      timeZone,
      today: localDate(now, timeZone),
      now,
    };
  }
}
