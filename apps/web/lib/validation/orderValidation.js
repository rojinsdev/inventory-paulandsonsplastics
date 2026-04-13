// Order Validation Library: Client-side validation to prevent server errors
// This catches issues before they reach the database

export class OrderValidationError extends Error {
    constructor(message, field = null, code = null) {
        super(message);
        this.name = 'OrderValidationError';
        this.field = field;
        this.code = code;
    }
}

export const OrderValidation = {
    /**
     * Validates order creation data before sending to server
     */
    validateOrderCreation: (orderData) => {
        const errors = [];

        // Validate customer
        if (!orderData.customer_id) {
            errors.push(new OrderValidationError('Customer is required', 'customer_id', 'REQUIRED'));
        }

        // Validate items
        if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            errors.push(new OrderValidationError('At least one item is required', 'items', 'REQUIRED'));
            return errors; // Can't validate items if array is invalid
        }

        orderData.items.forEach((item, index) => {
            const itemErrors = OrderValidation.validateOrderItem(item, index);
            errors.push(...itemErrors);
        });

        return errors;
    },

    /**
     * Validates individual order item
     */
    validateOrderItem: (item, index = 0) => {
        const errors = [];
        const fieldPrefix = `items[${index}]`;

        // Must have either product_id or cap_id
        if (!item.product_id && !item.cap_id) {
            errors.push(new OrderValidationError(
                'Item must have either a product or cap selected',
                `${fieldPrefix}.product_id`,
                'REQUIRED_EITHER'
            ));
        }

        // Validate quantity
        if (!item.quantity || item.quantity <= 0) {
            errors.push(new OrderValidationError(
                'Quantity must be greater than 0',
                `${fieldPrefix}.quantity`,
                'INVALID_QUANTITY'
            ));
        }

        // Validate unit_type
        const validUnitTypes = ['loose', 'packet', 'bundle', 'bag', 'box'];
        if (item.unit_type && !validUnitTypes.includes(item.unit_type)) {
            errors.push(new OrderValidationError(
                `Invalid unit type. Must be one of: ${validUnitTypes.join(', ')}`,
                `${fieldPrefix}.unit_type`,
                'INVALID_UNIT_TYPE'
            ));
        }

        // Cap selection validation for tub orders
        if (item.product_id && item.unit_type && ['packet', 'bundle'].includes(item.unit_type)) {
            if (!item.cap_id) {
                errors.push(new OrderValidationError(
                    `Cap selection is required for ${item.unit_type} orders`,
                    `${fieldPrefix}.cap_id`,
                    'CAP_REQUIRED'
                ));
            }
        }

        // Validate unit_price if provided
        if (item.unit_price !== undefined && item.unit_price < 0) {
            errors.push(new OrderValidationError(
                'Unit price cannot be negative',
                `${fieldPrefix}.unit_price`,
                'INVALID_PRICE'
            ));
        }

        return errors;
    },

    /**
     * Validates order preparation data
     */
    validateOrderPreparation: (preparationData) => {
        const errors = [];

        if (!preparationData.order_id) {
            errors.push(new OrderValidationError('Order ID is required', 'order_id', 'REQUIRED'));
        }

        if (!preparationData.items || !Array.isArray(preparationData.items) || preparationData.items.length === 0) {
            errors.push(new OrderValidationError('At least one item is required', 'items', 'REQUIRED'));
            return errors;
        }

        preparationData.items.forEach((item, index) => {
            if (!item.itemId && !item.item_id) {
                errors.push(new OrderValidationError(
                    'Item ID is required',
                    `items[${index}].item_id`,
                    'REQUIRED'
                ));
            }

            if (!item.quantity || item.quantity <= 0) {
                errors.push(new OrderValidationError(
                    'Quantity must be greater than 0',
                    `items[${index}].quantity`,
                    'INVALID_QUANTITY'
                ));
            }
        });

        return errors;
    },

    /**
     * Validates dispatch data
     */
    validateDispatch: (dispatchData) => {
        const errors = [];

        if (!dispatchData.order_id) {
            errors.push(new OrderValidationError('Order ID is required', 'order_id', 'REQUIRED'));
        }

        if (!dispatchData.items || !Array.isArray(dispatchData.items) || dispatchData.items.length === 0) {
            errors.push(new OrderValidationError('At least one item is required', 'items', 'REQUIRED'));
            return errors;
        }

        // Validate payment mode
        if (dispatchData.payment_mode && !['cash', 'credit'].includes(dispatchData.payment_mode)) {
            errors.push(new OrderValidationError(
                'Payment mode must be cash or credit',
                'payment_mode',
                'INVALID_PAYMENT_MODE'
            ));
        }

        // Validate discount type
        if (dispatchData.discount_type && !['percentage', 'fixed'].includes(dispatchData.discount_type)) {
            errors.push(new OrderValidationError(
                'Discount type must be percentage or fixed',
                'discount_type',
                'INVALID_DISCOUNT_TYPE'
            ));
        }

        // Validate discount value
        if (dispatchData.discount_value !== undefined) {
            if (dispatchData.discount_value < 0) {
                errors.push(new OrderValidationError(
                    'Discount value cannot be negative',
                    'discount_value',
                    'INVALID_DISCOUNT'
                ));
            }
            if (dispatchData.discount_type === 'percentage' && dispatchData.discount_value > 100) {
                errors.push(new OrderValidationError(
                    'Percentage discount cannot exceed 100%',
                    'discount_value',
                    'INVALID_DISCOUNT'
                ));
            }
        }

        // Validate initial payment
        if (dispatchData.initial_payment !== undefined && dispatchData.initial_payment < 0) {
            errors.push(new OrderValidationError(
                'Initial payment cannot be negative',
                'initial_payment',
                'INVALID_PAYMENT'
            ));
        }

        // Validate items
        dispatchData.items.forEach((item, index) => {
            if (!item.item_id) {
                errors.push(new OrderValidationError(
                    'Item ID is required',
                    `items[${index}].item_id`,
                    'REQUIRED'
                ));
            }

            if (!item.quantity || item.quantity <= 0) {
                errors.push(new OrderValidationError(
                    'Quantity must be greater than 0',
                    `items[${index}].quantity`,
                    'INVALID_QUANTITY'
                ));
            }

            if (item.unit_price === undefined || item.unit_price < 0) {
                errors.push(new OrderValidationError(
                    'Valid unit price is required',
                    `items[${index}].unit_price`,
                    'INVALID_PRICE'
                ));
            }
        });

        return errors;
    },

    /**
     * Formats validation errors for display
     */
    formatErrors: (errors) => {
        if (!errors || errors.length === 0) return null;

        return {
            hasErrors: true,
            count: errors.length,
            summary: errors.length === 1 ? errors[0].message : `${errors.length} validation errors found`,
            details: errors.map(error => ({
                message: error.message,
                field: error.field,
                code: error.code
            })),
            // Group errors by field for easier display
            fieldErrors: errors.reduce((acc, error) => {
                if (error.field) {
                    if (!acc[error.field]) acc[error.field] = [];
                    acc[error.field].push(error.message);
                }
                return acc;
            }, {})
        };
    }
};

export default OrderValidation;