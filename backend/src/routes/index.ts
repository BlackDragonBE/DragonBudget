import type { Router } from 'express';
import { importRouter } from './import';
import { transactionsRouter } from './transactions';
import { categoriesRouter } from './categories';
import { rulesRouter } from './rules';
import { reportsRouter } from './reports';
import { budgetsRouter } from './budgets';
import { recurringRouter } from './recurring';
import { dataportRouter } from './dataport';

// Mount point for all authenticated /api resource routers.
export function mountApiRoutes(api: Router): void {
  api.use('/import', importRouter);
  api.use('/transactions', transactionsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/rules', rulesRouter);
  api.use('/reports', reportsRouter);
  api.use('/budgets', budgetsRouter);
  api.use('/recurring', recurringRouter);
  api.use('/', dataportRouter);
}
