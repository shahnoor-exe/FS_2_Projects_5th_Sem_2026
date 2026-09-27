import { Router } from 'express';
import { getHealth, getReady, getVersion } from './health.controller.js';

const router = Router();

router.get('/health', getHealth);
router.get('/ready', getReady);
router.get('/version', getVersion);

export default router;
