import Product from "../models/Product.js";
import ProductSource from "../models/ProductSource.js";
import ProductOffer from "../models/ProductOffer.js";

export async function seedProductDiscoveryDemo() {
  const source = await ProductSource.findOneAndUpdate(
    { code: "demo_store" },
    {
      name: "AgentPay Demo Store",
      code: "demo_store",
      type: "demo",
      adapterKey: "demo_store",
      baseUrl: "https://example.com",
      enabled: true,
      healthStatus: "healthy",
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const product = await Product.findOneAndUpdate(
    { canonicalKey: "demo-coding-laptop" },
    {
      title: "Demo Coding Laptop",
      brand: "DemoBrand",
      category: "laptop",
      description: "Demo product used for local development only.",
      attributes: {
        ram: "16GB",
        storage: "512GB SSD",
        useCase: "coding",
      },
      canonicalKey: "demo-coding-laptop",
      active: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await ProductOffer.findOneAndUpdate(
    { sourceId: source._id, sourceProductId: "demo-laptop-001" },
    {
      productId: product._id,
      sourceId: source._id,
      sourceProductId: "demo-laptop-001",
      title: "Demo Coding Laptop",
      pricePaise: 6500000,
      currency: "INR",
      rating: 4.4,
      reviewCount: 120,
      availability: "in_stock",
      deliveryInfo: {
        available: true,
        text: "Demo delivery estimate",
        estimatedDate: null,
      },
      url: "https://example.com/product/demo-laptop-001",
      imageUrl: "https://example.com/images/demo-laptop-001.jpg",
      attributes: {
        ram: "16GB",
        storage: "512GB SSD",
      },
      fetchedAt: new Date(),
      expiresAt: null,
      active: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return { product, source };
}
