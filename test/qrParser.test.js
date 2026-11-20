const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Replicate or test the exact UPI QR parser logic server-side / test runner
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function parseUpiQr(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { isValid: false, error: 'Empty or invalid QR code data' };
  }

  const trimmed = rawText.trim();
  if (!/^upi:\/\/pay/i.test(trimmed)) {
    if (/^(https?|ftp|mailto|tel|sms|bitcoin|ethereum):/i.test(trimmed)) {
      return { isValid: false, error: 'Unsupported QR format: Only Indian UPI payment QR codes are supported.' };
    }
    return { isValid: false, error: 'Invalid QR Code: Not a recognized UPI payment code.' };
  }

  const qIndex = trimmed.indexOf('?');
  if (qIndex === -1) {
    return { isValid: false, error: 'Malformed UPI QR code: Missing payment parameters.' };
  }

  const queryString = trimmed.substring(qIndex + 1);
  const params = new URLSearchParams(queryString);

  const getParam = (name) => {
    for (const [key, value] of params.entries()) {
      if (key.toLowerCase() === name.toLowerCase()) return value;
    }
    return null;
  };

  const rawPa = getParam('pa');
  if (!rawPa) {
    return { isValid: false, error: 'Invalid UPI QR: Missing payee UPI ID (pa).' };
  }

  const upiId = decodeURIComponent(rawPa).trim();
  if (!UPI_ID_REGEX.test(upiId)) {
    return { isValid: false, error: `Invalid UPI ID format in QR: "${upiId}". Expected format: username@bank` };
  }

  const rawPn = getParam('pn');
  let recipientName = rawPn ? decodeURIComponent(rawPn).trim() : '';
  if (!recipientName) {
    recipientName = upiId.split('@')[0] || 'UPI Merchant';
  }

  const rawCu = getParam('cu');
  const currency = rawCu ? decodeURIComponent(rawCu).trim().toUpperCase() : 'INR';
  if (currency !== 'INR') {
    return { isValid: false, error: `Unsupported currency: ${currency}. Only INR is supported.` };
  }

  const rawAm = getParam('am');
  let amount = null;
  let hasFixedAmount = false;

  if (rawAm) {
    const parsedAmount = parseFloat(decodeURIComponent(rawAm).trim());
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      if (parsedAmount > 100000) {
        return { isValid: false, error: `Amount in QR (₹${parsedAmount}) exceeds the NPCI maximum limit of ₹1,00,000` };
      }
      amount = Math.round(parsedAmount * 100) / 100;
      hasFixedAmount = true;
    } else {
      return { isValid: false, error: 'Invalid or negative amount specified in QR code.' };
    }
  }

  const rawTn = getParam('tn');
  const note = rawTn ? decodeURIComponent(rawTn).trim().slice(0, 50) : '';

  const rawMc = getParam('mc');
  const merchantCode = rawMc ? decodeURIComponent(rawMc).trim() : null;
  const rawTr = getParam('tr');
  const referenceId = rawTr ? decodeURIComponent(rawTr).trim() : null;

  return {
    isValid: true,
    upiId,
    recipientName,
    amount,
    hasFixedAmount,
    currency: 'INR',
    note,
    merchantCode,
    referenceId,
    rawPayload: trimmed,
  };
}

describe('UPI QR Code Parser & Security Validation Suite', () => {
  test('Parses valid standard BharatQR / UPI merchant QR code', () => {
    const rawQr = 'upi://pay?pa=store.kirana@okaxis&pn=Kirana%20Supermarket&am=480.50&cu=INR&tn=Monthly%20Ration&mc=5411';
    const result = parseUpiQr(rawQr);

    assert.equal(result.isValid, true);
    assert.equal(result.upiId, 'store.kirana@okaxis');
    assert.equal(result.recipientName, 'Kirana Supermarket');
    assert.equal(result.amount, 480.50);
    assert.equal(result.hasFixedAmount, true);
    assert.equal(result.currency, 'INR');
    assert.equal(result.note, 'Monthly Ration');
    assert.equal(result.merchantCode, '5411');
  });

  test('Supports case-insensitive scheme (UPI://PAY?...)', () => {
    const rawQr = 'UPI://PAY?PA=doctor.clinic@sbi&PN=Dr.%20Sharma&AM=500&CU=INR';
    const result = parseUpiQr(rawQr);

    assert.equal(result.isValid, true);
    assert.equal(result.upiId, 'doctor.clinic@sbi');
    assert.equal(result.recipientName, 'Dr. Sharma');
    assert.equal(result.amount, 500.00);
  });

  test('Parses static QR without amount and flags hasFixedAmount as false', () => {
    const rawQr = 'upi://pay?pa=cafe.coffee@paytm&pn=Coffee%20House';
    const result = parseUpiQr(rawQr);

    assert.equal(result.isValid, true);
    assert.equal(result.amount, null);
    assert.equal(result.hasFixedAmount, false);
    assert.equal(result.recipientName, 'Coffee House');
  });

  test('Rejects arbitrary web URLs (phishing / malware QR protection)', () => {
    const maliciousUrls = [
      'https://phishing-site.com/steal-creds',
      'http://bank-login.fake/verify',
      'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      'mailto:scam@phish.com',
    ];

    for (const url of maliciousUrls) {
      const result = parseUpiQr(url);
      assert.equal(result.isValid, false);
      assert.ok(result.error.includes('Unsupported QR format'));
    }
  });

  test('Rejects non-UPI random text', () => {
    const result = parseUpiQr('Hello world this is not a QR');
    assert.equal(result.isValid, false);
    assert.ok(result.error.includes('Not a recognized UPI payment code'));
  });

  test('Rejects missing payee address (pa)', () => {
    const result = parseUpiQr('upi://pay?pn=Store&am=100');
    assert.equal(result.isValid, false);
    assert.ok(result.error.includes('Missing payee UPI ID'));
  });

  test('Rejects malformed UPI ID format', () => {
    const result = parseUpiQr('upi://pay?pa=invalid_vpa_without_bank&pn=Store');
    assert.equal(result.isValid, false);
    assert.ok(result.error.includes('Invalid UPI ID format'));
  });

  test('Rejects non-INR currency', () => {
    const result = parseUpiQr('upi://pay?pa=store@upi&pn=Store&am=10&cu=USD');
    assert.equal(result.isValid, false);
    assert.ok(result.error.includes('Unsupported currency'));
  });

  test('Rejects negative amount or amount exceeding NPCI ₹1,00,000 limit', () => {
    const negResult = parseUpiQr('upi://pay?pa=store@upi&pn=Store&am=-50');
    assert.equal(negResult.isValid, false);

    const overResult = parseUpiQr('upi://pay?pa=store@upi&pn=Store&am=150000');
    assert.equal(overResult.isValid, false);
    assert.ok(overResult.error.includes('exceeds the NPCI maximum limit'));
  });
});
