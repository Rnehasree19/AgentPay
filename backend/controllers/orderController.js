import { OrderService } from "../services/commerce/OrderService.js";
import { validateCreateOrderBody } from "../validators/orderValidator.js";

const orderService = new OrderService();

export async function createOrder(req, res, next) {
  try {
    validateCreateOrderBody(req.body);
    const idempotencyKey = req.get("Idempotency-Key");
    const result = await orderService.createOrder({
      offerId: req.body.offerId,
      approvalId: req.body.approvalId || null,
      variant: req.body.variant || null,
      authenticatedUserId: req.user.id,
      idempotencyKey,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getOrder(req, res, next) {
  try {
    return res.json({ order: await orderService.getOrder(req.params.orderId, req.user.id) });
  } catch (error) {
    return next(error);
  }
}

export async function listOrders(req, res, next) {
  try {
    return res.json({ orders: await orderService.listOrders(req.user.id) });
  } catch (error) {
    return next(error);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    return res.json({ order: await orderService.cancelOrder(req.params.orderId, req.user.id) });
  } catch (error) {
    return next(error);
  }
}