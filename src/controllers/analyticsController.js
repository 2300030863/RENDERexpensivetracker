const analyticsService = require('../services/analyticsService');

const getFirstDayOfMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const getToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTwelveMonthsAgo = () => {
  const now = new Date();
  now.setFullYear(now.getFullYear() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

class AnalyticsController {
  async getDashboardData(req, res, next) {
    try {
      const startDate = req.query.startDate || getFirstDayOfMonth();
      const endDate = req.query.endDate || getToday();

      const data = await analyticsService.getDashboardData(req.user, startDate, endDate);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async getCategorySpending(req, res, next) {
    try {
      const startDate = req.query.startDate || getFirstDayOfMonth();
      const endDate = req.query.endDate || getToday();

      const data = await analyticsService.getCategorySpending(req.user, startDate, endDate);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async getMonthlyTrend(req, res, next) {
    try {
      const startDate = req.query.startDate || getTwelveMonthsAgo();
      const endDate = req.query.endDate || getToday();

      const data = await analyticsService.getMonthlyTrend(req.user, startDate, endDate);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async getBudgetStatus(req, res, next) {
    try {
      const data = await analyticsService.getBudgetStatus(req.user);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnalyticsController();

