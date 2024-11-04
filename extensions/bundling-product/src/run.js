// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

const NO_CHANGES = { operations: [] };

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  if (!input.cart?.lines) return NO_CHANGES;

  const bundlesInCart = {};
  let nonBundlesInCart = {};
  let linesByProduct = {};
  let variantsByProduct = {};
  const cartTransformOperations = [];

  // Organize lines into bundles and non-bundles
  for (const line of input.cart.lines) {
    const isBundle = (line?.checkBundle?.value || "").toLowerCase() === 'yes' || (line?.bundleId?.value || "") !== "";
    if (isBundle && line.merchandise.__typename === 'ProductVariant') {
      const { id: lineId, merchandise: { id: variantId, product }, quantity } = line;

      // Handle bundles
      if (product?.bundleRawConfiguration?.jsonValue?.products) {
        const bundleConfig = product.bundleRawConfiguration.jsonValue;
        bundlesInCart[lineId] = {
          lineId,
          variantId,
          // title: product.title,
          quantity,
          price: { percentageDecrease: { value: parseFloat(bundleConfig.discount?.percentage || 0) || 0 } },
          products: bundleConfig.products,
        };
      }

      // Add to non-bundles
      nonBundlesInCart[lineId] = { lineId, quantity, productId: product.id, variantId };
      // console.log("bundles in cart data ", JSON.stringify(bundlesInCart));
      // console.log("non bundles in cart dat ", JSON.stringify(nonBundlesInCart));
    }
  }

  if (!Object.keys(bundlesInCart).length || !Object.keys(nonBundlesInCart).length) {
    return NO_CHANGES;
  }

  function updateQuantityVariables() {
    linesByProduct = {};
    variantsByProduct = {};

    for (const lineId in nonBundlesInCart) {
      const { productId, variantId, quantity } = nonBundlesInCart[lineId];
      linesByProduct[productId] = linesByProduct[productId] || {};
      linesByProduct[productId][lineId] = quantity;
      
      variantsByProduct[productId] = variantsByProduct[productId] || {};
      variantsByProduct[productId][variantId] = (variantsByProduct[productId][variantId] || 0) + quantity;
    }
    // console.log("Lines by Product:", JSON.stringify(linesByProduct));
    // console.log("Variants by Product:", JSON.stringify(variantsByProduct));
  }

  updateQuantityVariables();

  function createBundles() {
    let recheck = false;
    const bundlesSorted = Object.values(bundlesInCart).sort((a, b) => b.quantity - a.quantity);
    console.log('bundles sorted ', JSON.stringify(bundlesSorted));

    bundlesSorted.forEach(bundleDetail => {
      let bundleEligibleQuantity = bundleDetail.quantity;

      const isBundleEligible = Object.keys(bundleDetail.products).every(productId => {
        const requiredQty = parseInt(bundleDetail.products[productId].quantity);
        const availableQty = Math.max(...Object.values(variantsByProduct[productId.replace('/product/', '/Product/')])) || 0;
        
        if (availableQty < requiredQty) return false;
        
        const possibleQty = Math.floor(availableQty / requiredQty);
        if (possibleQty < bundleEligibleQuantity) bundleEligibleQuantity = possibleQty;

        console.log('required qty ', requiredQty);
        console.log('available qty ', availableQty);
        console.log('bundle available qty ', availableQty);

        return true;
      });

      if (isBundleEligible && bundleEligibleQuantity > 0) {
        const _nonBundlesInCart = JSON.parse(JSON.stringify(nonBundlesInCart));
        const cartLines = Object.keys(bundleDetail.products).map(productId => {
          const requiredQty = parseInt(bundleDetail.products[productId].quantity) * bundleEligibleQuantity;
          let eligibleLineId = null;

          for (const lineId in linesByProduct[productId]) {
            if (_nonBundlesInCart[lineId].quantity >= requiredQty) {
              eligibleLineId = lineId;
              _nonBundlesInCart[lineId].quantity -= requiredQty;
              break;
            }
          }

          return eligibleLineId ? { cartLineId: eligibleLineId, quantity: requiredQty } : null;
        }).filter(item => item);

        if (cartLines.length === Object.keys(bundleDetail.products).length) {
          cartLines.push({ cartLineId: bundleDetail.lineId, quantity: bundleEligibleQuantity });
          cartTransformOperations.push({
            merge: {
              parentVariantId: bundleDetail.variantId,
              price: bundleDetail.price,
              title: bundleDetail.title,
              cartLines,
              attributes: [{ key: '_bundle_position', value: (cartTransformOperations.length + 1).toString() }],
            },
          });

          nonBundlesInCart = _nonBundlesInCart;
          bundleDetail.quantity -= bundleEligibleQuantity;
          updateQuantityVariables();

          if (bundleDetail.quantity > 0) recheck = true;
        }
      }
    });

    if (recheck) createBundles();
  }

  createBundles();

  return cartTransformOperations.length ? { operations: cartTransformOperations } : NO_CHANGES;
}
