import { Router } from 'express';
import { crmController } from './crm.controller';

export const crmRouter = Router();

crmRouter.get('/health', (req, res) => crmController.health(req, res));
crmRouter.get('/customers', (req, res, next) => crmController.listCustomers(req, res, next));
crmRouter.get('/customers/:id', (req, res, next) => crmController.getCustomer(req, res, next));
crmRouter.post('/loyalty/points', (req, res, next) => crmController.awardPoints(req, res, next));
