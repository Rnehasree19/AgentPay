import { PaymentService } from "../services/payment/PaymentService.js";

const paymentService = new PaymentService();

export async function createPayment(req, res, next) {
  try {
    const result = await paymentService.createPaymentForOrder({
      orderId: req.params.orderId,
      authenticatedUserId: req.user.id,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const result = await paymentService.verifyPayment({
      paymentId: req.params.paymentId,
      authenticatedUserId: req.user.id,
      razorpayPaymentId: req.body?.razorpayPaymentId,
      razorpayOrderId: req.body?.razorpayOrderId,
      razorpaySignature: req.body?.razorpaySignature,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function reconcilePayment(req, res, next) {
  try {
    const result = await paymentService.reconcilePayment({
      paymentId: req.params.paymentId,
      authenticatedUserId: req.user.id,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}