import { useState } from "react";
import { getSafeExternalUrl } from "../utils/safeUrl";

function ProductImage({ imageUrl, title }) {
  const safeImageUrl = getSafeExternalUrl(imageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = safeImageUrl && !imageFailed;

  return (
    <div className="product-image-area">
      {showImage ? (
        <img
          className="product-image"
          src={safeImageUrl}
          alt={title ? `${title} product image` : "Product image"}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="product-image-placeholder" role="img" aria-label="Demo product image">
          <span aria-hidden="true">A</span>
          <small>Demo product image</small>
        </div>
      )}
    </div>
  );
}

export default ProductImage;