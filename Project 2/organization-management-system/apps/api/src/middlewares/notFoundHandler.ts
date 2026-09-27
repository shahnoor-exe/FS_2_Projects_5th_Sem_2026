import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../utils/errors.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Resource not found at ${req.method} ${req.originalUrl}`));
}
