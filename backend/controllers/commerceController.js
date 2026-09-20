import { OfferSelectionService } from "../services/commerce/OfferSelectionService.js";
import { validateOfferSelectionRequest } from "../validators/commerceValidator.js";

const offerSelectionService = new OfferSelectionService();

export async function selectOffer(req, res, next) {
  try {
    validateOfferSelectionRequest(req.body);

    const decision = await offerSelectionService.select({
      offerId: req.body.offerId,
      variant: req.body.variant || null,
      authenticatedUserId: req.user.id,
    });

    return res.json({
      type: "commerce_decision",
      ...decision,
    });
  } catch (error) {
    return next(error);
  }
}

export default selectOffer;