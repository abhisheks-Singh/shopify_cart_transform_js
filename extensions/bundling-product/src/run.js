// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

const NO_CHANGES = {
  operations: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const groupedItems = {};

  input.cart.lines.forEach((line) => {
    const bundleId = line.bundleId;
    const container_parent = line.container_variant;
    const { merchandise } = line; 
    const { __typename } = merchandise;

    if (__typename === "ProductVariant") {
      const product = merchandise.product;
      const parentVariantId = product?.parent_variant?.value;

      if (bundleId && bundleId.value) {
        if (!groupedItems[bundleId.value]) {
          groupedItems[bundleId.value] = {
            lines: [],
            parentVariantId: parentVariantId, 
            container_parent: container_parent
          };
        }
        groupedItems[bundleId.value].lines.push({
          id: line.id,
          quantity: line.quantity,
        });
      }
    }
  });

  return {
    operations: Object.values(groupedItems).map((group) => ({
      merge: {
        cartLines: group.lines.map((line) => ({
          cartLineId: line.id,
          quantity: line.quantity,   
        })),
        parentVariantId: group.parentVariantId,
      },
    })),
  };
}
