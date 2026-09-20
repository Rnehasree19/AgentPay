import { RazorpayWebhookService } from "../services/payment/RazorpayWebhookService.js";

const razorpayWebhookService = new RazorpayWebhookService();

export function createRazorpayWebhookHandler(service = razorpayWebhookService) {
  return async function handleRazorpayWebhook(req, res, next) {
    try {
      const { statusCode, body } = await service.handle({
        rawBody: req.body,
        headers: req.headers,
      });

      return res.status(statusCode).json(body);
    } catch (error) {
      return next(error);
    }
  };
}

export const razorpayWebhook = createRazorpayWebhookHandler();

export default razorpayWebhook;
