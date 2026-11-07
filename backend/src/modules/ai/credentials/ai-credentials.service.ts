import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SecretBox, SecretBoxError } from '../../../common/utils/secret-box';
import { PrismaService } from '../../../database/prisma.service';
import {
  AI_PROVIDER_IDS,
  AiProviderId,
  PROVIDER_PRESETS,
} from '../llm/provider-presets';
import {
  SaveAiCredentialDto,
  UpdateAiPreferencesDto,
} from './dto/ai-credentials.dto';

export const AI_SECRET_BOX = Symbol('AI_SECRET_BOX');
const VERIFY_TIMEOUT_MS = 10_000;

export interface ActiveAiKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  fallbackEnabled: boolean;
}

const contextOf = (userId: string, provider: string) =>
  `ai-key:${userId}:${provider}`;

/**
 * A person's own AI provider keys. The only readers of a stored key are `activeKey` and
 * `saveKey`'s check against the provider; nothing here returns one to a caller outside the
 * backend.
 */
@Injectable()
export class AiCredentialsService {
  private readonly logger = new Logger(AiCredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_SECRET_BOX) private readonly box: SecretBox | null,
  ) {}

  async overview(userId: string) {
    const [rows, user] = await Promise.all([
      this.prisma.aiCredential.findMany({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiProvider: true, aiFallbackEnabled: true },
      }),
    ]);
    return {
      available: this.box !== null,
      activeProvider: user.aiProvider,
      fallbackEnabled: user.aiFallbackEnabled,
      providers: AI_PROVIDER_IDS.map((provider) => {
        const row = rows.find((r) => r.provider === provider);
        const preset = PROVIDER_PRESETS[provider];
        return {
          provider,
          label: preset.label,
          defaultModel: preset.defaultModel,
          connected: Boolean(row),
          last4: row?.last4 ?? null,
          model: row?.model ?? null,
          verifiedAt: row?.verifiedAt ?? null,
        };
      }),
    };
  }

  async saveKey(
    userId: string,
    provider: AiProviderId,
    dto: SaveAiCredentialDto,
  ) {
    const box = this.requireBox();
    const model = dto.model ?? PROVIDER_PRESETS[provider].defaultModel;
    await this.verifyWithProvider(provider, dto.apiKey, model);

    const data = {
      ciphertext: box.seal(dto.apiKey, contextOf(userId, provider)),
      last4: dto.apiKey.slice(-4),
      model: dto.model ?? null,
      verifiedAt: new Date(),
    };
    await this.prisma.aiCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data },
      update: data,
    });
    // The first key a person adds is the one they want used.
    await this.prisma.user.updateMany({
      where: { id: userId, aiProvider: null },
      data: { aiProvider: provider },
    });
    return this.overview(userId);
  }

  async removeKey(userId: string, provider: AiProviderId) {
    await this.prisma.aiCredential.deleteMany({ where: { userId, provider } });
    await this.prisma.user.updateMany({
      where: { id: userId, aiProvider: provider },
      data: { aiProvider: null },
    });
    return this.overview(userId);
  }

  async updatePreferences(userId: string, dto: UpdateAiPreferencesDto) {
    if (dto.activeProvider) {
      const stored = await this.prisma.aiCredential.count({
        where: { userId, provider: dto.activeProvider },
      });
      if (!stored) {
        throw new BadRequestException('Add a key for that provider first');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.activeProvider !== undefined
          ? { aiProvider: dto.activeProvider }
          : {}),
        ...(dto.fallbackEnabled !== undefined
          ? { aiFallbackEnabled: dto.fallbackEnabled }
          : {}),
      },
    });
    return this.overview(userId);
  }

  /** The decrypted key behind the person's chosen provider, or null to use the shared one. */
  async activeKey(userId: string): Promise<ActiveAiKey | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiProvider: true, aiFallbackEnabled: true },
    });
    const provider = AI_PROVIDER_IDS.find((id) => id === user?.aiProvider);
    if (!user || !provider) return null;
    const row = await this.prisma.aiCredential.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) return null;
    try {
      return {
        provider,
        apiKey: this.requireBox().open(
          row.ciphertext,
          contextOf(userId, provider),
        ),
        model: row.model ?? PROVIDER_PRESETS[provider].defaultModel,
        fallbackEnabled: user.aiFallbackEnabled,
      };
    } catch (error) {
      // A rotated or lost encryption key: the key can't be read, so the caller decides what
      // the person's fallback setting allows. Neither the key nor the ciphertext is logged.
      if (
        !(
          error instanceof SecretBoxError ||
          error instanceof ServiceUnavailableException
        )
      )
        throw error;
      this.logger.error(
        `A stored AI key could not be opened (user ${userId}, ${provider})`,
      );
      return {
        provider,
        apiKey: '',
        model: '',
        fallbackEnabled: user.aiFallbackEnabled,
      };
    }
  }

  private requireBox(): SecretBox {
    if (!this.box) {
      throw new ServiceUnavailableException({
        code: 'AI_KEYS_NOT_CONFIGURED',
        message: 'Storing your own API key is not set up on this server.',
      });
    }
    return this.box;
  }

  /**
   * Asks the provider for its model list with the key: proves the key works and that the model is
   * one it offers, before anything is stored.
   */
  private async verifyWithProvider(
    provider: AiProviderId,
    apiKey: string,
    model: string,
  ) {
    const preset = PROVIDER_PRESETS[provider];
    let response: Response;
    try {
      response = await fetch(`${preset.baseUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(
        `Could not reach ${preset.label}. Try again in a moment.`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException({
        code: 'AI_KEY_INVALID',
        message: `${preset.label} did not accept this key.`,
      });
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `${preset.label} could not check the key right now. Try again in a moment.`,
      );
    }
    const offered = await modelIdsOf(response);
    if (offered && !offered.has(model)) {
      throw new BadRequestException({
        code: 'AI_MODEL_UNAVAILABLE',
        message: `${preset.label} does not offer the model "${model}" for this key. Enter a model it offers.`,
      });
    }
  }
}

async function modelIdsOf(response: Response): Promise<Set<string> | null> {
  try {
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    const ids = (body.data ?? []).flatMap((m) =>
      typeof m.id === 'string' ? [m.id, m.id.replace(/^models\//, '')] : [],
    );
    return ids.length ? new Set(ids) : null;
  } catch {
    return null;
  }
}
