import { ApprovalService } from "../services/commerce/ApprovalService.js";
import { validateApprovalRequestBody } from "../validators/approvalValidator.js";

const approvalService = new ApprovalService();

export async function requestApproval(req, res, next) {
  try {
    validateApprovalRequestBody(req.body);
    const result = await approvalService.requestApproval({
      offerId: req.body.offerId,
      variant: req.body.variant || null,
      authenticatedUserId: req.user.id,
    });
    return res.json({ type: "approval_result", ...result });
  } catch (error) {
    return next(error);
  }
}

export async function approveApproval(req, res, next) {
  try {
    const result = await approvalService.approve(req.params.approvalId, req.user.id);
    return res.json({ type: "approval_result", ...result });
  } catch (error) {
    return next(error);
  }
}

export async function rejectApproval(req, res, next) {
  try {
    const result = await approvalService.reject(req.params.approvalId, req.user.id);
    return res.json({ type: "approval_result", ...result });
  } catch (error) {
    return next(error);
  }
}

export async function listApprovals(req, res, next) {
  try {
    return res.json({ approvals: await approvalService.listApprovals(req.user.id) });
  } catch (error) {
    return next(error);
  }
}

export async function getApproval(req, res, next) {
  try {
    return res.json({ approval: await approvalService.getApproval(req.params.approvalId, req.user.id) });
  } catch (error) {
    return next(error);
  }
}