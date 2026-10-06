import { Router } from 'express';

import { ContributionService } from '../../contributions/service.ts';
import { positiveId } from '../../contributions/validation.ts';
import { getPool } from '../../db/pool.ts';
import { jsonObject } from '../../utils/http.ts';
import { asyncHandler } from './auth.ts';

// Mounted under the existing superadmin-only admin router.
export function createContributionRouter(service = () => new ContributionService(getPool())) {
const contributionRouter = Router({ mergeParams: true });

contributionRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await service().report(positiveId(req.params.eventId, 'event_id')));
}));
contributionRouter.post('/types', asyncHandler(async (req, res) => {
  res.status(201).json(await service().createType(positiveId(req.params.eventId, 'event_id'), jsonObject(req), req.auth!.id));
}));
contributionRouter.post('/types/:typeId/assign', asyncHandler(async (req, res) => {
  res.json(await service().assign(positiveId(req.params.eventId, 'event_id'), positiveId(req.params.typeId, 'type_id'), jsonObject(req), req.auth!.id));
}));
contributionRouter.post('/:contributionId/payments', asyncHandler(async (req, res) => {
  res.json(await service().pay(positiveId(req.params.eventId, 'event_id'), positiveId(req.params.contributionId, 'contribution_id'), jsonObject(req), req.auth!.id));
}));
contributionRouter.post('/payments/:paymentId/void', asyncHandler(async (req, res) => {
  res.json(await service().voidPayment(positiveId(req.params.eventId, 'event_id'), positiveId(req.params.paymentId, 'payment_id'), jsonObject(req), req.auth!.id));
}));
contributionRouter.post('/:contributionId/waive', asyncHandler(async (req, res) => {
  res.json(await service().waive(positiveId(req.params.eventId, 'event_id'), positiveId(req.params.contributionId, 'contribution_id'), jsonObject(req), req.auth!.id));
}));
return contributionRouter;
}

export const contributionRouter = createContributionRouter();
