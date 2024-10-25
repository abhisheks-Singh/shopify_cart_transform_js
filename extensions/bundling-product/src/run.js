// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

const NO_CHANGES = {
  operations: [],
};

export function run(input) {
  const expectedQuantities = {
    "gid://shopify/ProductVariant/42058134683717": 1,
    "gid://shopify/ProductVariant/42058134356037": 10,
    "gid://shopify/ProductVariant/42095392849989": 1,
  };

  const groupedItems = {};
  let additionalItems = [];

  input.cart.lines.forEach((line) => {
    const { merchandise, bundleId, container_variant } = line;

    if (merchandise.__typename !== "ProductVariant") {
      return;
    }

    const variantId = merchandise.id;
    const quantity = line.quantity;

    const groupKey =
      bundleId?.value && container_variant?.value
        ? `${bundleId.value}_${container_variant.value}`
        : `newGroup_${new Date().toISOString()}`;

    if (!expectedQuantities[variantId]) {
      additionalItems.push(line);
      return;
    }

    if (!groupedItems[groupKey]) {
      groupedItems[groupKey] = {
        lines: [],
        totalQuantity: {},
      };
    }

    groupedItems[groupKey].lines.push(line);

    if (!groupedItems[groupKey].totalQuantity[variantId]) {
      groupedItems[groupKey].totalQuantity[variantId] = 0;
    }
    groupedItems[groupKey].totalQuantity[variantId] += quantity;
  });

  const operations = [];
  for (const [groupKey, group] of Object.entries(groupedItems)) {
    const quantitiesMatch = Object.entries(expectedQuantities).every(
      ([variantId, expectedQuantity]) => {
        const actualQuantity = group.totalQuantity[variantId] || 0;
        return actualQuantity === expectedQuantity;
      }
    );

    const hasValidBundleItems =
      Object.keys(group.totalQuantity).length ===
      Object.keys(expectedQuantities).length;

    if (quantitiesMatch && hasValidBundleItems) {
      const linesToBundle = group.lines;

      let parentVariantId = linesToBundle[0].container_variant?.value
        ? `${linesToBundle[0].container_variant.value}`
        : "42095392849989";
      let discountPercentage = 10.0;

      const discountConfig =
        linesToBundle[0].merchandise.product.bundle_raw_config?.value;
      if (discountConfig) {
        try {
          const config = JSON.parse(discountConfig);
          discountPercentage =
            parseFloat(config.discount?.percentage) || discountPercentage;
        } catch (error) {}
      }

      const operation = {
        merge: {
          cartLines: linesToBundle.map((line) => ({
            cartLineId: line.id,
            quantity: line.quantity,
          })),
          parentVariantId: `gid://shopify/ProductVariant/${parentVariantId}`,
          price: {
            percentageDecrease: {
              value: discountPercentage,
            },
          },
        },
      };

      operations.push(operation);
    }
  }

  if (operations.length > 0) {
    return {
      operations: operations,
    };
  }

  return NO_CHANGES;
}

