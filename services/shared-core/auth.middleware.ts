import jwt, { SignOptions } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { oriConfig } from './config';
import { UnauthorizedError, ForbiddenError } from './domain.error';

export type OriRole = 'CHANNEL_CLIENT' | 'POS_TERMINAL' | 'ADMIN' | 'SYSTEM';

export interface OriJwtPayload {
  sub: string;
  role: OriRole;
  channel?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: OriJwtPayload;
    }
  }
}

export function signOriToken(payload: OriJwtPayload): string {
  const options: SignOptions = { expiresIn: oriConfig.security.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, oriConfig.security.jwtSecret, options);
}

export function verifyOriToken(token: string): OriJwtPayload {
  try {
    return jwt.verify(token, oriConfig.security.jwtSecret) as OriJwtPayload;
  } catch {
    throw new UnauthorizedError('JWT Access Token không hợp lệ hoặc đã hết hạn.');
  }
}

export function authenticateJwt(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError('Vui lòng cung cấp Authorization: Bearer <token>.');
    }
    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Định dạng header Authorization phải là Bearer <token>.');
    }
    req.authUser = verifyOriToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...allowed: OriRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.authUser) {
        throw new UnauthorizedError('Vui lòng đăng nhập để tiếp tục.');
      }
      if (!allowed.includes(req.authUser.role)) {
        throw new ForbiddenError('Không đủ quyền thực hiện thao tác này.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
