/**
 * GraphQL mutations for Shopify operations
 */

export const ORDER_UPDATE = `
    mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
            order {
                id
                metafields(first: 10) {
                    edges {
                        node {
                            namespace
                            key
                            value
                            type
                        }
                    }
                }
            }
            userErrors {
                field
                message
            }
        }
    }
`;

export const ORDER_UPDATE_CUSTOM_ATTRIBUTES = `
    mutation OrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
            order {
                id
                customAttributes {
                    key
                    value
                }
            }
            userErrors {
                field
                message
            }
        }
    }
`;

export const FULFILLMENT_CREATE_V2 = `
    mutation FulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
            fulfillment {
                id
                status
                trackingInfo(first: 10) {
                    company
                    number
                    url
                }
            }
            userErrors {
                field
                message
            }
        }
    }
`;