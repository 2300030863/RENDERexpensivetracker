const paymentService = require('../services/paymentService');

class PaymentController {
  async createPayment(req, res, next) {
    try {
      const result = await paymentService.createPayment(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async initiateUpiPayment(req, res, next) {
    try {
      const result = await paymentService.initiateUpiPayment(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async retryPayment(req, res, next) {
    try {
      const result = await paymentService.retryPayment(req.user, req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updatePaymentStatus(req, res, next) {
    try {
      const result = await paymentService.updatePaymentStatus(req.user, req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPaymentAttempts(req, res, next) {
    try {
      const result = await paymentService.getPaymentAttempts(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPayments(req, res, next) {
    try {
      const result = await paymentService.getPayments(req.user, req.query);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPaymentById(req, res, next) {
    try {
      const result = await paymentService.getPaymentById(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelPayment(req, res, next) {
    try {
      const result = await paymentService.cancelPayment(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getRecipients(req, res, next) {
    try {
      const result = await paymentService.getRecipients(req.user, req.query.search);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getRecentRecipients(req, res, next) {
    try {
      const result = await paymentService.getRecentRecipients(req.user, req.query.limit);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getFavoriteRecipients(req, res, next) {
    try {
      const result = await paymentService.getFavoriteRecipients(req.user);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createRecipient(req, res, next) {
    try {
      const result = await paymentService.createRecipient(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async toggleFavoriteRecipient(req, res, next) {
    try {
      const result = await paymentService.toggleFavoriteRecipient(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteRecipient(req, res, next) {
    try {
      const result = await paymentService.deleteRecipient(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  getGatewayConfig(req, res, next) {
    try {
      const config = paymentService.getGatewayConfig();
      return res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  async createGatewayOrder(req, res, next) {
    try {
      const result = await paymentService.createGatewayOrder(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async markPaymentInitiated(req, res, next) {
    try {
      const result = await paymentService.markPaymentInitiated(req.user, req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async verifyGatewayPayment(req, res, next) {
    try {
      const result = await paymentService.verifyGatewayPayment(req.user, req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async checkPaymentStatus(req, res, next) {
    try {
      const result = await paymentService.checkPaymentStatus(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async safeRetryGatewayPayment(req, res, next) {
    try {
      const result = await paymentService.safeRetryGatewayPayment(req.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async processGatewayWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'] || req.headers['x-gateway-signature'];
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const result = await paymentService.processGatewayWebhook(rawBody, signature, req.body);
      return res.status(200).json(result);
    } catch (error) {
      console.error('[PaymentController] Webhook error:', error);
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new PaymentController();
