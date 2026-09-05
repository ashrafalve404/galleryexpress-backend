import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserRole } from '@prisma/client';

import { SmsService } from '../sms/sms.service';

function getPhoneVariations(raw: string): string[] {
  const cleaned = raw.trim();
  const variations = new Set<string>([cleaned]);

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 10) {
    let core = digits;
    if (core.startsWith('880')) core = core.slice(3);
    else if (core.startsWith('88')) core = core.slice(2);
    else if (core.startsWith('0')) core = core.slice(1);

    if (core.length === 10) {
      variations.add(`+880${core}`);
      variations.add(`880${core}`);
      variations.add(`0${core}`);
      variations.add(core);
    }
  }

  return Array.from(variations);
}

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MINUTES = 30;
  private otpStore = new Map<string, { otp: string; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private smsService: SmsService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string) {
    const identifier = (dto.phone || dto.email || dto.loginIdentifier || '').trim();
    if (!identifier) {
      throw new BadRequestException('Phone number or email is required');
    }

    const phoneVars = getPhoneVariations(identifier);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: { in: phoneVars } },
          { email: identifier.toLowerCase() },
          { email: `${identifier}@galleryexpress.internal` },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account locked. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    // Check status
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const updateData: {
        failedLoginAttempts: number;
        lockedUntil?: Date;
      } = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(
          lockUntil.getMinutes() + this.LOCK_DURATION_MINUTES,
        );
        updateData.lockedUntil = lockUntil;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      throw new UnauthorizedException('Invalid phone number or password');
    }

    // Reset failed attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.companyId,
    );

    // Store refresh token hash
    await this.storeRefreshToken(user.id, tokens.refreshToken, ipAddress);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
      },
      ...tokens,
    };
  }

  async sendRegisterOtp(phone: string) {
    const rawPhone = (phone || '').trim();
    if (!rawPhone) {
      throw new BadRequestException('Mobile number is required for OTP verification');
    }

    const phoneVars = getPhoneVariations(rawPhone);
    const existingPhone = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: { in: phoneVars } },
          { email: `${rawPhone}@galleryexpress.internal` },
        ],
      },
    });

    if (existingPhone) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    // Generate 4-digit numeric OTP (1000-9999)
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const cleanedPhone = this.smsService.formatPhoneNumber(rawPhone);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.otpStore.set(cleanedPhone, { otp, expiresAt });

    // Send SMS via BulkSMSBD
    await this.smsService.sendOtp(rawPhone, otp);

    return {
      success: true,
      message: `OTP verification code sent to ${rawPhone}`,
      phone: rawPhone,
    };
  }

  async register(dto: RegisterDto & { otp?: string }, companyId?: string) {
    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const company = await this.prisma.company.findFirst({ select: { id: true } });
      if (!company) {
        throw new BadRequestException('No company configured in system');
      }
      targetCompanyId = company.id;
    }

    const rawPhone = (dto.phone || '').trim();
    if (rawPhone) {
      if (!dto.otp) {
        throw new BadRequestException('OTP verification code is required to complete registration.');
      }

      const cleanedPhone = this.smsService.formatPhoneNumber(rawPhone);
      const cached = this.otpStore.get(cleanedPhone);

      const isValid =
        cached &&
        cached.otp === dto.otp.trim() &&
        cached.expiresAt > Date.now();

      if (!isValid) {
        throw new BadRequestException(
          'Invalid or expired OTP code. Please enter the correct OTP sent to your mobile phone.',
        );
      }

      // Clear OTP after successful verification
      this.otpStore.delete(cleanedPhone);
    }

    const email = dto.email ? dto.email.toLowerCase() : rawPhone ? `${rawPhone}@galleryexpress.internal` : `user_${Date.now()}@galleryexpress.internal`;

    if (rawPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: rawPhone },
      });
      if (existingPhone) {
        throw new ConflictException('An account with this phone number already exists.');
      }
    }

    const existingEmail = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existingEmail) {
      throw new ConflictException('An account with this email/phone already exists.');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        companyId: targetCompanyId,
        email,
        phone: rawPhone || null,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName || '',
        role: UserRole.CUSTOMER,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        companyId: true,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.companyId,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    // Hash the incoming token to find it in DB
    const tokenHash = this.hashToken(dto.refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is inactive');
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
      storedToken.user.companyId,
    );

    await this.storeRefreshToken(storedToken.user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { revoked: true, revokedAt: new Date() },
      });
    } else {
      // Revoke all tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
    return { message: 'Logged out successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid)
      throw new BadRequestException('Current password is incorrect');

    const newHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Invalidate all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    return { message: 'Password changed successfully' };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    companyId: string,
  ) {
    const payload = { sub: userId, email, role, companyId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: (this.configService.get<string>('jwt.accessExpires') ||
          '15m') as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: (this.configService.get<string>('jwt.refreshExpires') ||
          '7d') as never,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    ipAddress?: string,
  ) {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
      },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
