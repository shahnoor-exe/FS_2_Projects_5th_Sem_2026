import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  switchOrg,
} from './auth.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import {
  registerRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
} from '../../middlewares/rateLimiter.js';

const router = Router();

router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/refresh', refreshRateLimiter, refresh);
router.post('/logout', logout);
router.get('/me', authenticate, requireOrgContext, getMe);
router.post('/switch-org', authenticate, switchOrg);

export default router;
