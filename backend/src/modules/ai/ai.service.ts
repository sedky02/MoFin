import { Injectable, Logger } from '@nestjs/common';
import { DraftTransaction } from '@prisma/client';
import { localDate } from '../../common/utils/time-zone';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { ParseTransactionIntentDto } from './dto/ai.dto';
import { DraftContext, ProposedDraft } from './drafts/draft-context';
import { categoryFitsAccount, repairDraft } from './drafts/draft-repairer';
import { ModelDraftParser } from './drafts/model-draft-parser';
import { parseWithRegex } from './drafts/regex-draft-parser';
import { isAiProviderFailure } from './llm/ai-unavailable.exception';

/** How many accounts and categories the model is shown (the list API's max). */
export const CONTEXT_LIST_LIMIT = 100;

/**
 * The model proposes; repairDraft keeps only ids the user owns; the regex parser answers when there
 * is no model or it fails. The user approves every draft.
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

  /** The local parser matches by name, so it may pick another person's "Groceries". */
  private withFittingCategory(
    draft: ProposedDraft,
    ctx: DraftContext,
  ): ProposedDraft {
    const { categoryId, fromAccountId, toAccountId } = draft.data;
    if (!categoryId) return draft;
    return categoryFitsAccount(categoryId, fromAccountId ?? toAccountId, ctx)
      ? draft
      : { ...draft, data: { ...draft.data, categoryId: undefined } };
  }

  private async propose(ctx: DraftContext): Promise<ProposedDraft[]> {
    if (!this.modelParser.enabled) {
      this.logger.warn('AI_API_KEY is not set, using the local parser');
      return [this.withFittingCategory(parseWithRegex(ctx), ctx)];
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
    return [this.withFittingCategory(parseWithRegex(ctx), ctx)];
  }

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
    // Only accounts the user can post to: a draft for one they view would fail.
    const accounts = await this.accountsService.list(
      userId,
      { status: 'active', limit: CONTEXT_LIST_LIMIT, offset: 0 },
      'transact',
    );
    // Theirs, and those of the owners of the shared accounts they can post to.
    const ownerIds = [
      ...new Set([userId, ...accounts.data.map((a) => a.userId)]),
    ];
    const categories = await this.categoriesService.listForOwners(
      ownerIds,
      CONTEXT_LIST_LIMIT,
    );
    // Past the limit the model can't see some ids, and repairDraft drops any
    // it guesses. Rare enough to only log for now.
    if (accounts.total > accounts.data.length) {
      this.logger.warn(
        `Drafting with ${accounts.data.length} of ${accounts.total} accounts in context`,
      );
    }
    if (categories.length === CONTEXT_LIST_LIMIT) {
      this.logger.warn(
        `Drafting with the first ${CONTEXT_LIST_LIMIT} categories in context`,
      );
    }
    const now = new Date();
    const timeZone = dto.timeZone ?? 'UTC';
    return {
      input: dto.input,
      accounts: accounts.data,
      categories,
      defaultAccountId: dto.defaultAccountId,
      defaultCurrency: dto.defaultCurrency,
      timeZone,
      today: localDate(now, timeZone),
      now,
    };
  }
}
