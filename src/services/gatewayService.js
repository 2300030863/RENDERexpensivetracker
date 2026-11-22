const crypto = require('crypto');

// Standard NPCI and RBI Payment Gateway Aggregator Service
class GatewayService {
  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    this.merchantName = process.env.MERCHANT_NAME || 'DocQevrilo Expense Tracker';
    this.merchantVpa = process.env.MERCHANT_VPA || 'merchant@razorpay';
  }

  isConfigured() {
    const validKey = Boolean(this.keyId && !this.keyId.includes('dummy') && !this.keyId.includes('placeholder') && !this.keyId.includes('your_'));
    const validSecret = Boolean(this.keySecret && !this.keySecret.includes('dummy') && !this.keySecret.includes('placeholder') && !this.keySecret.includes('your_'));
    return validKey && validSecret;
  }

  isSandboxMode() {
    // In production, simulated sandbox is strictly disabled
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    if (!this.isConfigured()) return true;
    return this.keyId.startsWith('rzp_test_') || process.env.PAYMENT_GATEWAY_PROVIDER === 'sandbox';
  }

  getPublicConfig() {
    const configured = this.isConfigured();
    return {
      provider: 'RAZORPAY',
      isConfigured: configured,
      keyId: configured ? this.keyId : '',
      isSandbox: this.isSandboxMode(),
      merchantName: this.merchantName,
      currency: 'INR',
    };
  }

  // 1. Create Gateway Order
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    const amountInPaise = Math.round(Number(amount) * 100);

    // If live or sandbox Razorpay keys are configured, call the official API
    if (this.isConfigured()) {
      try {
        const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency,
            receipt: String(receipt).slice(0, 40),
            notes,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          const errMsg = data.error?.description || data.error?.message || 'Gateway order creation failed';
          const err = new Error(errMsg);
          err.statusCode = response.status;
          err.gatewayError = data.error;
          throw err;
        }

        const createdAtMs = data.created_at ? data.created_at * 1000 : Date.now();
        const expiresAt = new Date(createdAtMs + 12 * 60 * 1000).toISOString();

        return {
          id: data.id,
          amount: data.amount,
          amountPaid: data.amount_paid,
          amountDue: data.amount_due,
          currency: data.currency,
          receipt: data.receipt,
          status: data.status,
          createdAt: new Date(createdAtMs).toISOString(),
          expiresAt,
          isSandbox: this.isSandboxMode(),
        };
      } catch (err) {
        if (err.statusCode) throw err;
        console.warn('[GatewayService] Razorpay API unreachable, falling back to Sandbox simulation:', err.message);
      }
    }

    // High-fidelity Sandbox Simulation for testing and development
    const now = Date.now();
    const sandboxOrderId = `order_sand_${now}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(now + 12 * 60 * 1000).toISOString();
    return {
      id: sandboxOrderId,
      amount: amountInPaise,
      amountPaid: 0,
      amountDue: amountInPaise,
      currency,
      receipt,
      status: 'created',
      createdAt: new Date(now).toISOString(),
      expiresAt,
      isSandbox: true,
    };
  }

  // 2. Verify Payment Signature (HMAC-SHA256)
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) {
      return false;
    }

    // Sandbox simulated signature check (STRICT: disabled in production)
    if (this.isSandboxMode() && process.env.NODE_ENV !== 'production') {
      if (signature === `sandbox_sig_${orderId}_${paymentId}` || signature.startsWith('sandbox_valid_')) {
        return true;
      }
    }

    const secret = this.keySecret || 'sandbox_test_secret';
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    try {
      const sigBuf = Buffer.from(String(signature), 'hex');
      const expBuf = Buffer.from(expectedSignature, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (_) {
      return false;
    }
  }

  // 3. Verify Webhook Signature (HMAC-SHA256 on raw request body)
  verifyWebhookSignature(rawBody, signature) {
    if (!signature) return false;

    // In sandbox test without webhook secret, accept sandbox signature (STRICT: disabled in production)
    if (this.isSandboxMode() && process.env.NODE_ENV !== 'production' && signature.startsWith('sandbox_webhook_sig_')) {
      return true;
    }

    const secret = this.webhookSecret;
    if (!secret) {
      console.warn('[GatewayService] Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured');
      return false;
    }

    try {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(String(signature).trim());
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (err) {
      console.error('[GatewayService] Webhook signature verification error:', err.message);
      return false;
    }
  }

  // 4. Fetch Order from Gateway
  async fetchOrder(orderId) {
    if (!orderId) return null;

    if (this.isConfigured() && !orderId.startsWith('order_sand_')) {
      try {
        const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
          method: 'GET',
          headers: { Authorization: `Basic ${auth}` },
        });
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.warn(`[GatewayService] Error fetching order ${orderId}:`, err.message);
      }
    }

    // In sandbox simulation, default order status is created unless explicitly verified
    return {
      id: orderId,
      status: 'created',
      amount_paid: 0,
      currency: 'INR',
    };
  }

  // 5. Fetch Payment Details from Gateway
  async fetchPayment(paymentId, expectedPaise = null) {
    if (!paymentId) return null;

    if (this.isConfigured() && !paymentId.startsWith('pay_sand_')) {
      try {
        const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          method: 'GET',
          headers: { Authorization: `Basic ${auth}` },
        });
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.warn(`[GatewayService] Error fetching payment ${paymentId}:`, err.message);
      }
    }

    // Sandbox simulated payment representation
    return {
      id: paymentId,
      status: 'captured',
      amount: expectedPaise !== null ? expectedPaise : 10000,
      currency: 'INR',
      method: 'upi',
      vpa: 'user@okhdfcbank',
    };
  }

  // 6. Generate Dynamic Merchant UPI QR String (NPCI standard compliant)
  generateDynamicUpiQr({ amount, orderId, note = 'Order Payment' }) {
    const numAmount = Number(amount);
    const cleanNote = encodeURIComponent(String(note).slice(0, 50));
    const cleanOrder = encodeURIComponent(String(orderId));
    const cleanVpa = encodeURIComponent(this.merchantVpa);
    const cleanName = encodeURIComponent(this.merchantName);

    return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&mc=5411&tr=${cleanOrder}&am=${numAmount.toFixed(2)}&cu=INR&tn=${cleanNote}`;
  }
}

module.exports = new GatewayService();
