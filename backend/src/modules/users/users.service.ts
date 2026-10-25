import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserInput, UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  createUser(input: CreateUserInput) {
    return this.prisma.user.create({ data: input });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, settings: true, createdAt: true, updatedAt: true, passwordHash: true }
    });
    if (!user) throw new NotFoundException('User not found');
    return withHasPassword(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, settings: dto.settings as Prisma.InputJsonValue | undefined },
      select: { id: true, email: true, displayName: true, settings: true, updatedAt: true, passwordHash: true }
    });
    return withHasPassword(user);
  }
}

/**
 * Swaps the password hash for `hasPassword`, so the client can tell a
 * Google-only account (no password to change) without ever seeing the hash.
 */
function withHasPassword<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...profile } = user;
  return { ...profile, hasPassword: passwordHash !== null };
}
