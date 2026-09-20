import express from "express";
import { searchProducts } from "../controllers/productSearchController.js";

const router = express.Router();

router.post("/search", searchProducts);

export default router;
