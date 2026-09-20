import express from "express";

import { selectOffer } from "../controllers/commerceController.js";
import { approveApproval, getApproval, listApprovals, rejectApproval, requestApproval } from "../controllers/approvalController.js";
import { cancelOrder, createOrder, getOrder, listOrders } from "../controllers/orderController.js";
import { createPayment, reconcilePayment, verifyPayment } from "../controllers/paymentController.js";
import { requireAuthentication } from "../middleware/requireAuthentication.js";

const router = express.Router();

router.post("/select", requireAuthentication, selectOffer);
router.post("/approval-requests", requireAuthentication, requestApproval);
router.get("/approval-requests", requireAuthentication, listApprovals);
router.get("/approval-requests/:approvalId", requireAuthentication, getApproval);
router.post("/approval-requests/:approvalId/approve", requireAuthentication, approveApproval);
router.post("/approval-requests/:approvalId/reject", requireAuthentication, rejectApproval);
router.post("/orders", requireAuthentication, createOrder);
router.get("/orders", requireAuthentication, listOrders);
router.get("/orders/:orderId", requireAuthentication, getOrder);
router.post("/orders/:orderId/cancel", requireAuthentication, cancelOrder);
router.post("/orders/:orderId/payment", requireAuthentication, createPayment);
router.post("/payments/:paymentId/verify", requireAuthentication, verifyPayment);
router.post("/payments/:paymentId/reconcile", requireAuthentication, reconcilePayment);

export default router;