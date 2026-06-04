import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateApiKeyDto, LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.createUser({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash
    });
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email);
  }

  googleOAuthStub() {
    return {
      status: 'stub',
      message: 'Wire Passport Google strategy here; service should upsert user and issue tokens.'
    };
  }

  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    const rawKey = `mcp_${randomBytes(32).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 12);
    const apiKey = await this.prisma.apiKey.create({
      data: { userId, name: dto.name, keyHash },
      select: { id: true, name: true, createdAt: true }
    });

    return { ...apiKey, apiKey: rawKey };
  }

  async validateApiKey(apiKey: string) {
    const activeKeys = await this.prisma.apiKey.findMany({
      where: { revokedAt: null },
      include: { user: true }
    });

    for (const key of activeKeys) {
      if (await bcrypt.compare(apiKey, key.keyHash)) {
        await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
        return { id: key.user.id, email: key.user.email };
      }
    }

    throw new UnauthorizedException('Invalid MCP API key');
  }

  private async issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m')
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d')
      })
    ]);

    return { accessToken, refreshToken };
  }
}
